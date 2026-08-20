import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo, useRef, DragEvent } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload, FiUpload,
  FiUsers, FiShoppingBag, FiTruck, FiPackage, FiAlertCircle,
  FiFilter, FiSearch, FiX, FiBriefcase, FiMapPin,
  FiFile, FiCheck, FiAlertTriangle, FiChevronDown, FiEye, FiEyeOff
} from 'react-icons/fi';

// ---------- Lazy loaded heavy components ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ---------- Simple API Cache Hook ----------
const cache = new Map<string, { data: any; timestamp: number }>();

function useApiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 300_000
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetcher();
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
  }, [key, fetcher, ttlMs]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// ---------- Types ----------
type CustomerType = 'customer' | 'dealer' | 'distributor';   // vendor removed
type DuplicateAction = 'skip' | 'update' | 'stop';

interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id?: number; }
interface CustomerGroup { id: number; name: string; }

interface Customer {
  id: number;
  name: string;
  type: CustomerType;
  company_type?: string;
  email: string;
  contact_no: string;
  contact_person?: string;
  gst_number: string;
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
  group_id?: number | null;
  group?: CustomerGroup;
  opening_balance?: number;
  credit_limit?: number;
  due_days?: number;
  outstanding_amount?: number;   // <-- Added
  fax?: string;
  website?: string;
  note?: string;
  license_no?: string;
  custom_field_1?: string;
  custom_field_2?: string;
  is_active: boolean;
  company_id: number | null;
  branch_id: number | null;
  company?: Company;
  branch?: Branch;
}

interface CustomerFormData {
  name: string;
  type: CustomerType;
  company_type: string;
  email: string;
  contact_no: string;
  contact_person: string;
  gst_number: string;
  registration_type: string;
  pan: string;
  billing_street: string;
  billing_landmark: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_pincode: string;
  shipping_street: string;
  shipping_landmark: string;
  shipping_city: string;
  shipping_state: string;
  shipping_country: string;
  shipping_pincode: string;
  eway_bill_distance: number | string;
  group_id: number | string;
  opening_balance: number | string;
  credit_limit: number | string;
  due_days: number | string;
  outstanding_amount?: number | string;
  fax: string;
  website: string;
  note: string;
  license_no: string;
  custom_field_1: string;
  custom_field_2: string;
  is_active: boolean;
  company_id: number | null | string;
  branch_id: number | null | string;
  same_as_billing: boolean;
}

interface ImportPreviewRow {
  row: number;
  data: Record<string, any>;
  valid: boolean;
  errors: Record<string, string>;
  name: string;
  email: string;
}

interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
}

// ---------- Skeleton Components ----------
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
    {[...Array(10)].map((_, i) => (
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
  icon: any; label: string; value: number;
  tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' :
             'bg-teal-100 text-teal-600';
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

// ---------- GST Lookup Hook ----------
function useGstLookup() {
  const [lookingUp, setLookingUp] = useState(false);

  const lookupGst = useCallback(async (gstin: string) => {
    if (!gstin || gstin.length < 10) return null;
    setLookingUp(true);
    try {
      const result = await apiClient.lookupGst(gstin);
      return result;
    } catch {
      return null;
    } finally {
      setLookingUp(false);
    }
  }, []);

  return { lookupGst, lookingUp };
}

// ---------- Main Component ----------
export function CustomersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>({
    name: '',
    type: 'customer',
    company_type: '',
    email: '',
    contact_no: '',
    contact_person: '',
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
    group_id: '',
    opening_balance: '',
    credit_limit: '',
    due_days: '',
    outstanding_amount: '',
    fax: '',
    website: '',
    note: '',
    license_no: '',
    custom_field_1: '',
    custom_field_2: '',
    is_active: true,
    company_id: '',
    branch_id: '',
    same_as_billing: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  // ── Import state ──
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'result'>('select');
  const [importLoading, setImportLoading] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; field: string; message: string }>>([]);
  const [importResultMessage, setImportResultMessage] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Outstanding amount visibility state ──
  const [outstandingVisibleIds, setOutstandingVisibleIds] = useState<Set<number>>(new Set());

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const {
    data: customers, loading: custLoading, error: custError,
    refresh: refreshCustomers,
  } = useApiCache<Customer[]>('customers', () => apiClient.getCustomers());

  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const {
    data: customerGroups, refresh: refreshGroups,
  } = useApiCache<CustomerGroup[]>('customerGroups', () => apiClient.getCustomerGroups());

  // ---------- Filter & Search ----------
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    let filtered = [...customers];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.name?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.contact_no?.toLowerCase().includes(term) ||
        c.gst_number?.toLowerCase().includes(term)
      );
    }
    if (filterType !== 'all') filtered = filtered.filter(c => c.type === filterType);
    if (filterCompany !== 'all') filtered = filtered.filter(c => c.company_id === parseInt(filterCompany));
    if (filterBranch !== 'all') filtered = filtered.filter(c => c.branch_id === parseInt(filterBranch));
    return filtered;
  }, [customers, searchTerm, filterType, filterCompany, filterBranch]);

  const summary = useMemo(() => ({
    total: customers?.length || 0,
    customersCount: customers?.filter(c => c.type === 'customer').length || 0,
    dealers: customers?.filter(c => c.type === 'dealer').length || 0,
    distributors: customers?.filter(c => c.type === 'distributor').length || 0,
  }), [customers]);

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredCustomers.length / rowsPerPage);
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredCustomers.slice(start, start + rowsPerPage);
  }, [filteredCustomers, currentPage]);

  useEffect(() => setCurrentPage(1), [searchTerm, filterType, filterCompany, filterBranch]);

  // ---------- Branch filters ----------
  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      const companyId = parseInt(String(formData.company_id));
      return branches.filter(b => b.company_id === companyId);
    }
    return [];
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter(b => b.company_id === parseInt(filterCompany));
    }
    return branches || [];
  }, [filterCompany, branches]);

  // ---------- GST Auto‑fill ----------
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
      showError('Unable to fetch GSTIN details. Check the number and try again.');
    }
  };

  // ---------- Same as Billing ----------
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

  // ---------- Group management ----------
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    setAddingGroup(true);
    try {
      await apiClient.createCustomerGroup({ name: newGroupName.trim() });
      refreshGroups();
      setNewGroupName('');
      setShowGroupModal(false);
      showSuccess('Group added');
    } catch (err: any) {
      showError('Failed to add group', err.message);
    } finally {
      setAddingGroup(false);
    }
  };

  // ---------- Bulk actions ----------
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} customer(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteCustomer(id)));
      showSuccess('Bulk delete', `${selectedIds.length} deleted.`);
      addAppLog({ module: 'Customers', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length}` });
      setSelectedIds([]);
      refreshCustomers();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkTypeChange = async (type: CustomerType) => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change type to ${type} for ${selectedIds.length}?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateCustomer(id, { type })));
      showSuccess('Bulk update', `Type changed for ${selectedIds.length} customer(s).`);
      addAppLog({ module: 'Customers', action: 'Bulk type change', status: 'success', message: `Changed to ${type}` });
      setSelectedIds([]);
      refreshCustomers();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  // ---------- CRUD Handlers ----------
  const handleCreate = useCallback(() => {
    setEditingId(null);
    setFormData({
      name: '', type: 'customer', company_type: '', email: '',
      contact_person: '', contact_no: '', gst_number: '', registration_type: '', pan: '',
      billing_street: '', billing_landmark: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
      shipping_street: '', shipping_landmark: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
      eway_bill_distance: '', group_id: '', opening_balance: '', credit_limit: '', due_days: '',
      outstanding_amount: '',
      fax: '', website: '', note: '', license_no: '', custom_field_1: '', custom_field_2: '',
      is_active: true, company_id: '', branch_id: '',
      same_as_billing: true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((customer: Customer) => {
    setEditingId(customer.id);
    const same = !customer.shipping_street ||
      (customer.shipping_street === customer.billing_street &&
       customer.shipping_city === customer.billing_city);
    setFormData({
      name: customer.name || '',
      type: customer.type || 'customer',
      company_type: customer.company_type || '',
      email: customer.email || '',
      contact_person: customer.contact_person || '',
      contact_no: customer.contact_no || '',
      gst_number: customer.gst_number || '',
      registration_type: customer.registration_type || '',
      pan: customer.pan || '',
      billing_street: customer.billing_street || '',
      billing_landmark: customer.billing_landmark || '',
      billing_city: customer.billing_city || '',
      billing_state: customer.billing_state || '',
      billing_country: customer.billing_country || 'India',
      billing_pincode: customer.billing_pincode || '',
      shipping_street: customer.shipping_street || '',
      shipping_landmark: customer.shipping_landmark || '',
      shipping_city: customer.shipping_city || '',
      shipping_state: customer.shipping_state || '',
      shipping_country: customer.shipping_country || 'India',
      shipping_pincode: customer.shipping_pincode || '',
      eway_bill_distance: customer.eway_bill_distance ?? '',
      group_id: customer.group_id ?? '',
      opening_balance: customer.opening_balance ?? '',
      credit_limit: customer.credit_limit ?? '',
      due_days: customer.due_days ?? '',
      outstanding_amount: customer.outstanding_amount ?? '',
      fax: customer.fax || '',
      website: customer.website || '',
      note: customer.note || '',
      license_no: customer.license_no || '',
      custom_field_1: customer.custom_field_1 || '',
      custom_field_2: customer.custom_field_2 || '',
      is_active: customer.is_active !== false,
      company_id: customer.company_id ?? '',
      branch_id: customer.branch_id ?? '',
      same_as_billing: same,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (customer: Customer) => {
    if (!confirm(`Delete "${customer.name}"?`)) return;
    try {
      await apiClient.deleteCustomer(customer.id);
      showSuccess('Deleted', `${customer.name} removed.`);
      addAppLog({ module: 'Customers', action: 'Delete', status: 'success', message: `Deleted ${customer.name}` });
      refreshCustomers();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  }, [refreshCustomers, showSuccess, showError]);

  // ---------- Validation ----------
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.name.trim()) { errors.name = true; valid = false; }
    if (!formData.billing_city.trim()) { errors.billing_city = true; valid = false; }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = true; valid = false;
    }
    if (formData.contact_no.trim() && !/^\d+$/.test(formData.contact_no.trim())) {
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
      company_id: formData.company_id ? parseInt(String(formData.company_id)) : null,
      branch_id: formData.branch_id ? parseInt(String(formData.branch_id)) : null,
      group_id: formData.group_id ? parseInt(String(formData.group_id)) : null,
      eway_bill_distance: formData.eway_bill_distance ? Number(formData.eway_bill_distance) : null,
      opening_balance: formData.opening_balance ? Number(formData.opening_balance) : 0,
      credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
      due_days: formData.due_days ? Number(formData.due_days) : null,
      outstanding_amount: formData.outstanding_amount ? Number(formData.outstanding_amount) : 0,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateCustomer(editingId, payload);
        showSuccess('Updated', `${formData.name} updated.`);
        addAppLog({ module: 'Customers', action: 'Update', status: 'success', message: `Updated ${formData.name}` });
      } else {
        await apiClient.createCustomer(payload);
        showSuccess('Created', `${formData.name} created.`);
        addAppLog({ module: 'Customers', action: 'Create', status: 'success', message: `Created ${formData.name}` });
      }
      setIsPanelOpen(false);
      refreshCustomers();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Customers', action: 'Save', status: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshCustomers, showSuccess, showError]);

  // ---------- Export CSV ----------
  const handleExport = useCallback(() => {
    if (filteredCustomers.length === 0) {
      showError('Export failed', 'No customers to export.');
      return;
    }
    const headers = ['Name', 'Type', 'Email', 'Contact No', 'Company', 'Branch', 'GST', 'City', 'State', 'Outstanding'];
    const rows = filteredCustomers.map(c => [
      c.name, c.type, c.email, c.contact_no,
      c.company?.name || '', c.branch?.name || '',
      c.gst_number || '', c.billing_city || '', c.billing_state || '',
      c.outstanding_amount ?? 0
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Data exported.');
  }, [filteredCustomers, showSuccess, showError]);

  // ---------- IMPORT Handlers ----------
  const handleImportOpen = () => {
    setIsImportOpen(true);
    setImportStep('select');
    setImportFile(null);
    setImportPreview([]);
    setImportSummary(null);
    setImportErrors([]);
    setImportResultMessage('');
    setImportSuccess(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    const validTypes = ['text/csv', 'application/vnd.ms-excel'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && ext !== 'csv') {
      showError('Invalid file', 'Please select a CSV file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError('File too large', 'Maximum size is 10MB.');
      return;
    }
    setImportFile(file);
    handlePreview(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length) {
      handleFileChange(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handlePreview = async (file: File = importFile!) => {
    if (!file) return;
    setImportLoading(true);
    try {
      const response = await apiClient.importCustomers(file, duplicateAction, true);
      setImportPreview(response.preview || []);
      setImportSummary({ total: response.total, valid: response.valid, invalid: response.invalid });
      setImportErrors(response.errors || []);
      setImportStep('preview');
    } catch (err: any) {
      showError('Preview failed', err.message);
      setImportStep('select');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const response = await apiClient.importCustomers(importFile, duplicateAction, false);
      setImportSummary(response.summary);
      setImportErrors(response.errors || []);
      setImportResultMessage(response.message);
      setImportSuccess(response.success);
      setImportStep('result');
      if (response.success) {
        showSuccess('Import completed', response.message);
        refreshCustomers();
        addAppLog({ module: 'Customers', action: 'Import', status: 'success', message: `Imported ${response.summary.created} customers` });
      } else {
        showError('Import failed', response.message || 'Please check errors.');
        addAppLog({ module: 'Customers', action: 'Import', status: 'error', message: response.message });
      }
    } catch (err: any) {
      showError('Import failed', err.message);
      setImportStep('preview');
      addAppLog({ module: 'Customers', action: 'Import', status: 'error', message: err.message });
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadCustomerTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customers_template.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Template downloaded', 'Ready for import.');
    } catch (err: any) {
      showError('Template download failed', err.message);
    }
  };

  const handleDownloadErrorReport = () => {
    if (importErrors.length === 0) return;
    const headers = ['Row', 'Field', 'Error'];
    const rows = importErrors.map(e => [e.row, e.field, e.message]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customer_import_errors.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  // ---------- Outstanding visibility toggle ----------
  const toggleOutstandingVisibility = useCallback((id: number) => {
    setOutstandingVisibleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // ---------- Helper: render a field with red glow on error ----------
  const renderField = (
    label: string,
    field: keyof CustomerFormData,
    type: 'text' | 'number' | 'email' | 'tel' = 'text',
    required = false
  ) => {
    const value = formData[field] ?? '';
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
            hasError
              ? 'border-red-400 ring-2 ring-red-200 focus:border-red-500 focus:ring-red-300'
              : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
          }`}
          placeholder={`Enter ${label}`}
        />
      </div>
    );
  };

  // ---------- Table Columns ----------
  const columns = useMemo(() => [
    {
      name: 'Name',
      selector: (row: Customer) => row.name,
      sortable: true,
      cell: (row: Customer) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
            {row.name?.[0]?.toUpperCase() || 'C'}
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.name}</div>
            <div className="text-xs text-slate-400 capitalize">{row.type}</div>
          </div>
        </div>
      ),
      width: '220px',
    },
    {
      name: 'Type',
      selector: (row: Customer) => row.type,
      cell: (row: Customer) => {
        const map: Record<string, { label: string; color: string }> = {
          customer: { label: 'Customer', color: 'bg-blue-100 text-blue-700' },
          dealer: { label: 'Dealer', color: 'bg-purple-100 text-purple-700' },
          distributor: { label: 'Distributor', color: 'bg-teal-100 text-teal-700' },
        };
        const t = map[row.type] || map.customer;
        return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${t.color}`}>{t.label}</span>;
      },
      sortable: true,
      width: '130px',
    },
    {
      name: 'Email',
      selector: (row: Customer) => row.email,
      cell: (row: Customer) => <span className="text-sm text-slate-600">{row.email}</span>,
      width: '200px',
    },
    {
      name: 'Contact No',
      selector: (row: Customer) => row.contact_no,
      cell: (row: Customer) => <span className="text-sm text-slate-600">{row.contact_no}</span>,
      width: '150px',
    },
    {
      name: 'Outstanding',
      selector: (row: Customer) => row.outstanding_amount ?? 0,
      sortable: true,
      cell: (row: Customer) => {
        const isVisible = outstandingVisibleIds.has(row.id);
        const amount = typeof row.outstanding_amount === 'number'
          ? row.outstanding_amount
          : parseFloat(row.outstanding_amount) || 0;
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {isVisible ? `₹${amount.toFixed(2)}` : '•••••'}
            </span>
            <button
              onClick={() => toggleOutstandingVisibility(row.id)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title={isVisible ? 'Hide amount' : 'Show amount'}
            >
              {isVisible ? <FiEyeOff size={16} /> : <FiEye size={16} />}
            </button>
          </div>
        );
      },
      width: '140px',
    },
    {
      name: 'Company',
      selector: (row: Customer) => row.company?.name || '-',
      cell: (row: Customer) => <span className="text-sm">{row.company?.name || '-'}</span>,
      width: '140px',
    },
    {
      name: 'Branch',
      selector: (row: Customer) => row.branch?.name || '-',
      cell: (row: Customer) => <span className="text-sm">{row.branch?.name || '-'}</span>,
      width: '140px',
    },
    {
      name: 'Actions',
      cell: (row: Customer) => (
        <div className="flex items-center gap-2">
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit"><FiEdit size={16} /></button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={16} /></button>
        </div>
      ),
      width: '100px',
    },
  ], [handleEdit, handleDelete, outstandingVisibleIds, toggleOutstandingVisibility]);

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Customer Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiUsers className="text-cyan-300" /> Customers
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Directory</span>
          </h1>
          <p className="text-sm text-slate-300">Manage customers, dealers & distributors</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshCustomers} disabled={custLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={custLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleImportOpen} className="rounded-xl bg-emerald-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-emerald-300 shadow-md shadow-emerald-500/20">
            <FiUpload className="inline mr-1" size={14} /> Import
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Customer
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Types</option>
            <option value="customer">Customer</option>
            <option value="dealer">Dealer</option>
            <option value="distributor">Distributor</option>
          </select>
          <select value={filterCompany} onChange={(e) => { setFilterCompany(e.target.value); setFilterBranch('all'); }} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Companies</option>
            {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Branches</option>
            {filteredBranchesFilter.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {customers ? (
          <>
            <StatCard icon={FiUsers} label="Total" value={summary.total} tone="blue" />
            <StatCard icon={FiShoppingBag} label="Customers" value={summary.customersCount} tone="emerald" />
            <StatCard icon={FiTruck} label="Dealers" value={summary.dealers} tone="purple" />
            <StatCard icon={FiPackage} label="Distributors" value={summary.distributors} tone="teal" />
          </>
        ) : (
          [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error banner */}
      {custError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {custError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => handleBulkTypeChange('customer')} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">
            <FiEdit size={16} /> Set Customer
          </button>
          <button onClick={() => handleBulkTypeChange('dealer')} className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-600">
            <FiEdit size={16} /> Set Dealer
          </button>
          <button onClick={() => handleBulkTypeChange('distributor')} className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-600">
            <FiEdit size={16} /> Set Distributor
          </button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {custLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Customers List"
                columns={columns}
                data={paginatedCustomers}
                loading={false}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                striped
                highlightOnHover
                pointerOnHover
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredCustomers.length)} of {filteredCustomers.length}
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

      {/* Offcanvas – Full Form with all features */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl">Loading form...</div>
          </div>
        }>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Customer' : 'Add Customer'}
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
              {/* Customer / Vendor Detail */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Customer / Vendor Detail
                </legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as CustomerType }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="customer">Customer</option>
                      <option value="dealer">Dealer</option>
                      <option value="distributor">Distributor</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                      <select
                        value={formData.company_id as string}
                        onChange={(e) => setFormData(prev => ({ ...prev, company_id: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                      <select
                        value={formData.branch_id as string}
                        onChange={(e) => setFormData(prev => ({ ...prev, branch_id: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Select Branch</option>
                        {filteredBranchesForm.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                    <div className="flex gap-2">
                      <input
                        id="gst_number"
                        type="text"
                        value={formData.gst_number}
                        onChange={handleGstChange}
                        className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="Enter GSTIN"
                      />
                      <button
                        type="button"
                        onClick={handleAutoFill}
                        disabled={lookingUp || !formData.gst_number}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                      >
                        {lookingUp ? 'Fetching...' : 'Auto Fill'}
                      </button>
                    </div>
                  </div>

                  {renderField('Company Name', 'name', 'text', true)}
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Contact Person', 'contact_person')}
                    <div>
                      <label htmlFor="contact_no" className="block text-sm font-medium text-gray-700 mb-1">Contact No</label>
                      <input
                        id="contact_no"
                        type="tel"
                        value={formData.contact_no}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setFormData(prev => ({ ...prev, contact_no: val }));
                        }}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${
                          formErrors.contact_no
                            ? 'border-red-400 ring-2 ring-red-200 focus:border-red-500 focus:ring-red-300'
                            : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
                        }`}
                        placeholder="Enter Contact No"
                      />
                    </div>
                  </div>
                  {renderField('Email', 'email', 'email')}
                </div>
              </fieldset>

              {/* Registration Details */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Registration Details
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Registration Type</label>
                    <select
                      value={formData.registration_type}
                      onChange={(e) => setFormData(prev => ({ ...prev, registration_type: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Select</option>
                      <option value="Registered">Registered</option>
                      <option value="Unregistered">Unregistered</option>
                    </select>
                  </div>
                  {renderField('PAN', 'pan')}
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
                    <textarea
                      value={formData.billing_street}
                      onChange={(e) => setFormData(prev => ({ ...prev, billing_street: e.target.value }))}
                      rows={2}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${
                        formErrors.billing_city ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
                      }`}
                      placeholder="Enter Address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('City', 'billing_city', 'text', true)}
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
                    <input
                      type="checkbox"
                      checked={formData.same_as_billing}
                      onChange={(e) => handleSameAsBillingToggle(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">Same as Billing Address</span>
                  </label>
                  {!formData.same_as_billing && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea
                          value={formData.shipping_street}
                          onChange={(e) => setFormData(prev => ({ ...prev, shipping_street: e.target.value }))}
                          rows={2}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          placeholder="Enter Shipping Address"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                          <input
                            type="text"
                            value={formData.shipping_city}
                            onChange={(e) => setFormData(prev => ({ ...prev, shipping_city: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            placeholder="City"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            value={formData.shipping_state}
                            onChange={(e) => setFormData(prev => ({ ...prev, shipping_state: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            placeholder="State"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                          <input
                            type="text"
                            value={formData.shipping_country}
                            onChange={(e) => setFormData(prev => ({ ...prev, shipping_country: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            placeholder="Country"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                          <input
                            type="text"
                            value={formData.shipping_pincode}
                            onChange={(e) => setFormData(prev => ({ ...prev, shipping_pincode: e.target.value }))}
                            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                            placeholder="Pincode"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Group & Financials */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Group & Balance
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                      <select
                        value={formData.group_id as string}
                        onChange={(e) => setFormData(prev => ({ ...prev, group_id: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Select Group</option>
                        {customerGroups?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setShowGroupModal(true)} className="mb-0.5 text-blue-600 text-sm hover:underline whitespace-nowrap">+ Add Group</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Opening Balance', 'opening_balance', 'number')}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Outstanding Amount</label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">₹</span>
                        <input
                          type="number"
                          value={formData.outstanding_amount ?? ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, outstanding_amount: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Credit</label>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">₹</span>
                        <input
                          type="number"
                          value={formData.credit_limit ?? ''}
                          onChange={(e) => setFormData(prev => ({ ...prev, credit_limit: e.target.value }))}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                          placeholder="0"
                        />
                      </div>
                      <span className="text-xs text-slate-500">(You pay the customer)</span>
                    </div>
                    {renderField('Due Days', 'due_days', 'number')}
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
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Additional Details
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Fax No', 'fax')}
                    {renderField('Website', 'website')}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
                      <textarea
                        value={formData.note}
                        onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        placeholder="Enter Note"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id="is_active"
                      checked={formData.is_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="is_active" className="text-sm text-gray-700">
                      Enable – Company will be visible on all documents
                    </label>
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
            <h3 className="text-lg font-semibold mb-4">Add Customer Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm mb-4"
              placeholder="Group name"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowGroupModal(false); setNewGroupName(''); }} className="px-4 py-2 rounded-lg border text-sm" disabled={addingGroup}>Cancel</button>
              <button onClick={handleAddGroup} disabled={addingGroup || !newGroupName.trim()} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {addingGroup ? 'Adding...' : 'Add Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IMPORT OFFCANVAS ── */}
      {isImportOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isImportOpen}
            title="Import Customers"
            onClose={() => setIsImportOpen(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setIsImportOpen(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={importLoading}>
                  Close
                </button>
                {importStep === 'select' && (
                  <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                    Browse File
                  </button>
                )}
                {importStep === 'preview' && !importLoading && (
                  <button onClick={handleImport} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50" disabled={!importSummary || importSummary.valid === 0}>
                    Import {importSummary && `(${importSummary.valid} valid)`}
                  </button>
                )}
                {importStep === 'result' && (
                  <button onClick={() => { setIsImportOpen(false); refreshCustomers(); }} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                    Close & Refresh
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              {importStep === 'select' && (
                <>
                  <div className="text-sm text-slate-600 mb-4">
                    Upload a CSV file to import customers. The file must match the required format. You can download a template below.
                  </div>
                  <div
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300'}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <FiUpload size={40} className="mx-auto text-slate-400 mb-3" />
                    <p className="text-sm text-slate-600">Drag and drop your CSV file here, or click to browse</p>
                    <input type="file" ref={fileInputRef} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileChange(file); }} accept=".csv" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="mt-3 px-4 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">
                      Browse Files
                    </button>
                  </div>
                  {importFile && (
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border">
                      <div className="flex items-center gap-2">
                        <FiFile className="text-blue-600" />
                        <span className="text-sm font-medium">{importFile.name}</span>
                        <span className="text-xs text-slate-500">({(importFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setImportStep('select'); }} className="text-rose-600 hover:text-rose-800">
                        <FiX size={18} />
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-4">
                    <button onClick={handleDownloadTemplate} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <FiDownload size={14} /> Download Template
                    </button>
                    {importFile && (
                      <button onClick={() => handlePreview(importFile)} disabled={importLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                        {importLoading ? 'Processing...' : 'Preview'}
                      </button>
                    )}
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div className="flex flex-wrap items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Duplicate Action:</span>
                      <select value={duplicateAction} onChange={(e) => setDuplicateAction(e.target.value as DuplicateAction)} className="rounded border px-2 py-1 text-sm" disabled={importLoading}>
                        <option value="skip">Skip</option>
                        <option value="update">Update</option>
                        <option value="stop">Stop</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>Total: <strong>{importSummary?.total || 0}</strong></span>
                      <span className="text-emerald-600">Valid: <strong>{importSummary?.valid || 0}</strong></span>
                      <span className="text-rose-600">Invalid: <strong>{importSummary?.invalid || 0}</strong></span>
                    </div>
                  </div>
                  {importLoading ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" /></div>
                  ) : (
                    <>
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 border-b">
                            <tr>
                              <th className="px-3 py-2 text-left">#</th>
                              <th className="px-3 py-2 text-left">Name</th>
                              <th className="px-3 py-2 text-left">Email</th>
                              <th className="px-3 py-2 text-left">Contact</th>
                              <th className="px-3 py-2 text-left">Company</th>
                              <th className="px-3 py-2 text-left">City</th>
                              <th className="px-3 py-2 text-left">Valid</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 50).map((row) => (
                              <tr key={row.row} className={`border-b ${row.valid ? '' : 'bg-rose-50'}`}>
                                <td className="px-3 py-2">{row.row}</td>
                                <td className="px-3 py-2">{row.data.name || '-'}</td>
                                <td className="px-3 py-2">{row.data.email || '-'}</td>
                                <td className="px-3 py-2">{row.data.contact_no || '-'}</td>
                                <td className="px-3 py-2">{row.data.company_id || '-'}</td>
                                <td className="px-3 py-2">{row.data.billing_city || '-'}</td>
                                <td className="px-3 py-2">{row.valid ? <FiCheck className="text-emerald-600" /> : <FiAlertTriangle className="text-rose-600" title={Object.values(row.errors).join(', ')} />}</td>
                              </tr>
                            ))}
                            {importPreview.length > 50 && <tr><td colSpan={7} className="px-3 py-2 text-center text-slate-500">... and {importPreview.length - 50} more rows</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      {importErrors.length > 0 && (
                        <div className="mt-4 p-3 bg-rose-50 rounded-lg border border-rose-200">
                          <p className="text-sm font-medium text-rose-700 mb-2">Validation errors:</p>
                          <ul className="text-xs text-rose-600 space-y-1 max-h-40 overflow-y-auto">
                            {importErrors.slice(0, 20).map((err, idx) => <li key={idx}>Row {err.row}: {err.field} – {err.message}</li>)}
                            {importErrors.length > 20 && <li>... and {importErrors.length - 20} more</li>}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {importStep === 'result' && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg ${importSuccess ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                    <h3 className="font-bold text-lg">{importSuccess ? '✅ Import Completed' : '❌ Import Failed'}</h3>
                    <p className="text-sm mt-1">{importResultMessage}</p>
                  </div>
                  {importSummary && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div className="bg-slate-50 p-3 rounded-lg text-center"><div className="font-bold">{importSummary.total}</div><div className="text-slate-500">Total</div></div>
                      <div className="bg-emerald-50 p-3 rounded-lg text-center"><div className="font-bold text-emerald-700">{importSummary.created ?? 0}</div><div className="text-slate-500">Created</div></div>
                      <div className="bg-blue-50 p-3 rounded-lg text-center"><div className="font-bold text-blue-700">{importSummary.updated ?? 0}</div><div className="text-slate-500">Updated</div></div>
                      <div className="bg-amber-50 p-3 rounded-lg text-center"><div className="font-bold text-amber-700">{importSummary.skipped ?? 0}</div><div className="text-slate-500">Skipped</div></div>
                      <div className="bg-rose-50 p-3 rounded-lg text-center"><div className="font-bold text-rose-700">{importSummary.failed ?? 0}</div><div className="text-slate-500">Failed</div></div>
                    </div>
                  )}
                  {importErrors.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center">
                        <p className="text-sm font-medium text-rose-700">Errors ({importErrors.length})</p>
                        <button onClick={handleDownloadErrorReport} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          <FiDownload size={12} /> Download Error Report
                        </button>
                      </div>
                      <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50"><tr><th className="px-3 py-1 text-left">Row</th><th className="px-3 py-1 text-left">Field</th><th className="px-3 py-1 text-left">Message</th></tr></thead>
                          <tbody>
                            {importErrors.slice(0, 50).map((err, idx) => <tr key={idx} className="border-t"><td className="px-3 py-1">{err.row}</td><td className="px-3 py-1">{err.field}</td><td className="px-3 py-1">{err.message}</td></tr>)}
                            {importErrors.length > 50 && <tr><td colSpan={3} className="px-3 py-1 text-center text-slate-500">... and {importErrors.length - 50} more</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}