import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiDownload, FiEye, FiEdit,
  FiCheckCircle, FiXCircle, FiFilter, FiSearch, FiAlertCircle,
  FiPackage, FiBarChart2, FiDollarSign, FiBox, FiTruck, FiX, FiImage
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

// ── Stable API Cache ──
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
interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id: number; }

interface InventoryItem {
  id: number;
  company_id: number;
  branch_id: number | null;
  company?: Company;
  branch?: Branch;
  name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  unit: string | null;
  purchase_price: number;
  sale_price: number;
  tax_rate: number;
  stock_quantity: number;
  reorder_level: number;
  description: string | null;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface InventoryFormData {
  company_id: number | string;
  branch_id: number | string;
  name: string;
  sku: string;
  barcode: string;
  brand: string;
  unit: string;
  purchase_price: number | string;
  sale_price: number | string;
  tax_rate: number | string;
  stock_quantity: number | string;
  reorder_level: number | string;
  description: string;
  active: boolean;
}

const UNIT_OPTIONS = [
  'Piece', 'Kg', 'Gram', 'Liter', 'Milliliter', 'Meter', 'Centimeter',
  'Box', 'Carton', 'Set', 'Pack', 'Unit', 'Hour', 'Day', 'Month',
  'Year', 'Dozen', 'Pair', 'Bundle', 'Bag', 'Roll', 'Sheet', 'Bottle',
  'Can', 'Case', 'Pallet', 'Drum'
];

// ── Skeleton Components ──
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

const StatCard = memo(({ icon: Icon, label, value, tone, prefix }: {
  icon: any; label: string; value: string | number; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal'; prefix?: string;
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
        <p className="text-2xl font-bold text-slate-900">{prefix}{value}</p>
      </div>
    </div>
  );
});

// ── Component ──
export function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<InventoryFormData>({
    company_id: '',
    branch_id: '',
    name: '',
    sku: '',
    barcode: '',
    brand: '',
    unit: 'Piece',
    purchase_price: '',
    sale_price: '',
    tax_rate: '',
    stock_quantity: '',
    reorder_level: '',
    description: '',
    active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const { showSuccess, showError } = useNotification();

  // ── API Caching ──
  const { data: companies, refresh: refreshComps } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches, refresh: refreshBranches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: items, loading: itemsLoading, error: itemsError, refresh: refreshItems } = useApiCache<InventoryItem[]>('inventory', () => apiClient.getProducts());

  // ── Next SKU generator (FU-{serial}) ──
  const generateNextSKU = useCallback(() => {
    if (!items) return 'FU-001';
    const prefix = 'FU-';
    let maxNum = 0;
    items.forEach(item => {
      if (item.sku && item.sku.startsWith(prefix)) {
        const numStr = item.sku.slice(prefix.length);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    const next = maxNum + 1;
    return `${prefix}${next.toString().padStart(3, '0')}`;
  }, [items]);

  // ── Auto‑generate SKU when creating new item ──
  useEffect(() => {
    if (!editingId && isPanelOpen && formData.name.trim() && !formData.sku.trim()) {
      const newSKU = generateNextSKU();
      setFormData(prev => ({ ...prev, sku: newSKU }));
    }
  }, [formData.name, editingId, isPanelOpen, generateNextSKU]);

  const brands = useMemo(() => {
    if (!items) return [];
    const br = new Set<string>();
    items.forEach(i => { if (i.brand) br.add(i.brand); });
    return Array.from(br);
  }, [items]);

  // ── Filter & Search ──
  const filteredItems = useMemo(() => {
    if (!items) return [];
    let filtered = [...items];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(term) ||
        item.sku?.toLowerCase().includes(term) ||
        item.barcode?.toLowerCase().includes(term) ||
        item.brand?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    }
    if (filterCompany !== 'all') filtered = filtered.filter(i => i.company_id === parseInt(filterCompany));
    if (filterBranch !== 'all') filtered = filtered.filter(i => i.branch_id === parseInt(filterBranch));
    if (filterBrand !== 'all') filtered = filtered.filter(i => i.brand === filterBrand);
    if (filterStatus !== 'all') {
      const s = filterStatus;
      if (s === 'active') filtered = filtered.filter(i => i.active);
      else if (s === 'inactive') filtered = filtered.filter(i => !i.active);
      else if (s === 'in_stock') filtered = filtered.filter(i => i.stock_quantity > i.reorder_level);
      else if (s === 'low') filtered = filtered.filter(i => i.stock_quantity > 0 && i.stock_quantity <= i.reorder_level);
      else if (s === 'out') filtered = filtered.filter(i => i.stock_quantity <= 0);
    }
    return filtered;
  }, [items, searchTerm, filterCompany, filterBranch, filterBrand, filterStatus]);

  const summary = useMemo(() => {
    if (!items) return { total: 0, active: 0, inactive: 0, lowStock: 0, outOfStock: 0, totalValue: 0 };
    const safe = (val: any) => { const n = typeof val === 'number' ? val : parseFloat(val); return isNaN(n) ? 0 : n; };
    return {
      total: items.length,
      active: items.filter(i => i.active).length,
      inactive: items.filter(i => !i.active).length,
      lowStock: items.filter(i => i.stock_quantity > 0 && i.stock_quantity <= i.reorder_level).length,
      outOfStock: items.filter(i => i.stock_quantity <= 0).length,
      totalValue: items.reduce((sum, i) => sum + safe(i.sale_price) * i.stock_quantity, 0),
    };
  }, [items]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredItems.length / rowsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, currentPage]);
  useEffect(() => setCurrentPage(1), [searchTerm, filterCompany, filterBranch, filterBrand, filterStatus]);

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

  // ── Bulk actions ──
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} item(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deleteProduct(id)));
      showSuccess('Bulk delete', `${selectedIds.length} item(s) deleted.`);
      setSelectedIds([]);
      refreshItems();
    } catch (err: any) { showError('Bulk delete failed', err.message); }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${label} ${selectedIds.length} item(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateProduct(id, { active } as any)));
      showSuccess('Bulk update', `${selectedIds.length} item(s) ${label}d.`);
      setSelectedIds([]);
      refreshItems();
    } catch (err: any) { showError('Bulk update failed', err.message); }
  };

  const handleBulkUpdateStock = async (quantity: number) => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateProduct(id, { stock_quantity: quantity } as any)));
      showSuccess('Bulk update', `Stock updated for ${selectedIds.length} item(s).`);
      setSelectedIds([]);
      refreshItems();
    } catch (err: any) { showError('Bulk update failed', err.message); }
  };

  // ── View / Edit / Delete ──
  const handleView = useCallback((item: InventoryItem) => {
    setViewingItem(item);
    setIsViewPanelOpen(true);
  }, []);

  const handleCreate = () => {
    setEditingId(null);
    setFormData({
      company_id: '', branch_id: '', name: '', sku: '', barcode: '', brand: '',
      unit: 'Piece', purchase_price: '', sale_price: '', tax_rate: '',
      stock_quantity: '', reorder_level: '', description: '', active: true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  };

  const handleEdit = useCallback((item: InventoryItem) => {
    setEditingId(item.id);
    setFormData({
      company_id: item.company_id || '',
      branch_id: item.branch_id ?? '',
      name: item.name || '',
      sku: item.sku || '',
      barcode: item.barcode || '',
      brand: item.brand || '',
      unit: item.unit || 'Piece',
      purchase_price: item.purchase_price ?? '',
      sale_price: item.sale_price ?? '',
      tax_rate: item.tax_rate ?? '',
      stock_quantity: item.stock_quantity ?? '',
      reorder_level: item.reorder_level ?? '',
      description: item.description || '',
      active: item.active ?? true,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleDelete = useCallback(async (item: InventoryItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await apiClient.deleteProduct(item.id);
      showSuccess('Item deleted', `"${item.name}" removed.`);
      refreshItems();
    } catch (err: any) { showError('Delete failed', err.message); }
  }, [refreshItems, showSuccess, showError]);

  // ── Validation ──
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.company_id || formData.company_id === '') { errors.company_id = true; valid = false; }
    if (!formData.name.trim()) { errors.name = true; valid = false; }
    if (!formData.sku.trim()) { errors.sku = true; valid = false; }
    const salePrice = typeof formData.sale_price === 'number' ? formData.sale_price : parseFloat(formData.sale_price);
    if (isNaN(salePrice) || salePrice < 0) { errors.sale_price = true; valid = false; }
    const stock = typeof formData.stock_quantity === 'number' ? formData.stock_quantity : parseInt(formData.stock_quantity);
    if (isNaN(stock) || stock < 0) { errors.stock_quantity = true; valid = false; }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const safe = (val: any) => { const n = typeof val === 'number' ? val : parseFloat(val); return isNaN(n) ? 0 : n; };
    const payload = {
      ...formData,
      company_id: parseInt(String(formData.company_id)),
      branch_id: formData.branch_id ? parseInt(String(formData.branch_id)) : null,
      purchase_price: safe(formData.purchase_price),
      sale_price: safe(formData.sale_price),
      tax_rate: safe(formData.tax_rate),
      stock_quantity: safe(formData.stock_quantity),
      reorder_level: safe(formData.reorder_level),
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateProduct(editingId, payload);
        showSuccess('Item updated', `"${formData.name}" updated.`);
        addAppLog({ module: 'Inventory', action: 'Update', status: 'success', message: `Updated ${formData.name}` });
      } else {
        await apiClient.createProduct(payload);
        showSuccess('Item created', `"${formData.name}" created.`);
        addAppLog({ module: 'Inventory', action: 'Create', status: 'success', message: `Created ${formData.name}` });
      }
      setIsPanelOpen(false);
      refreshItems();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Inventory', action: 'Save', status: 'error', message: err.message });
    } finally { setSubmitting(false); }
  }, [formData, editingId, refreshItems, showSuccess, showError]);

  const handleExport = useCallback(() => {
    if (filteredItems.length === 0) { showError('Export failed', 'No items to export.'); return; }
    const safe = (val: any) => { const n = typeof val === 'number' ? val : parseFloat(val); return isNaN(n) ? 0 : n; };
    const headers = ['Name', 'SKU', 'Barcode', 'Brand', 'Unit', 'Purchase Price', 'Sale Price', 'Tax Rate', 'Stock', 'Reorder Level', 'Description', 'Active'];
    const rows = filteredItems.map(item => [
      item.name, item.sku, item.barcode || '', item.brand || '', item.unit || '',
      safe(item.purchase_price).toFixed(2), safe(item.sale_price).toFixed(2), safe(item.tax_rate).toFixed(2),
      item.stock_quantity, item.reorder_level, item.description || '', item.active ? 'Active' : 'Inactive',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Inventory exported.');
  }, [filteredItems, showSuccess, showError]);

  // ── Table Columns ──
  const columns = useMemo(() => [
    {
      name: 'Name',
      selector: (row: InventoryItem) => row.name,
      sortable: true,
      cell: (row: InventoryItem) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {row.name?.[0]?.toUpperCase() || 'P'}
          </div>
          <div>
            <div className="font-medium text-slate-800">{row.name}</div>
            <div className="text-xs text-slate-400">{row.sku}</div>
          </div>
        </div>
      ),
      width: '220px',
    },
    {
      name: 'SKU',
      selector: (row: InventoryItem) => row.sku,
      cell: (row: InventoryItem) => <span className="text-sm text-slate-600">{row.sku}</span>,
      width: '100px',
    },
    {
      name: 'Brand',
      selector: (row: InventoryItem) => row.brand || '-',
      cell: (row: InventoryItem) => <span className="text-sm">{row.brand || '-'}</span>,
      width: '120px',
    },
    {
      name: 'Stock',
      selector: (row: InventoryItem) => row.stock_quantity,
      sortable: true,
      cell: (row: InventoryItem) => {
        const qty = row.stock_quantity;
        const level = row.reorder_level;
        let color = 'text-slate-700';
        if (qty <= 0) color = 'text-rose-600 font-medium';
        else if (qty <= level) color = 'text-amber-600 font-medium';
        return <span className={`text-sm ${color}`}>{qty}</span>;
      },
      width: '90px',
    },
    {
      name: 'Sale Price',
      selector: (row: InventoryItem) => {
        const price = typeof row.sale_price === 'number' ? row.sale_price : parseFloat(row.sale_price) || 0;
        return price;
      },
      sortable: true,
      cell: (row: InventoryItem) => {
        const price = typeof row.sale_price === 'number' ? row.sale_price : parseFloat(row.sale_price) || 0;
        return <span className="font-medium">₹{price.toFixed(2)}</span>;
      },
      width: '120px',
    },
    {
      name: 'Status',
      selector: (row: InventoryItem) => row.active ? 'Active' : 'Inactive',
      cell: (row: InventoryItem) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${row.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {row.active ? 'Active' : 'Inactive'}
        </span>
      ),
      sortable: true,
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: InventoryItem) => (
        <div className="flex items-center gap-1">
          <button onClick={() => handleView(row)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50" title="View"><FiEye size={16} /></button>
          <button onClick={() => handleEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit"><FiEdit size={16} /></button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={16} /></button>
        </div>
      ),
      width: '120px',
    },
  ], [handleView, handleEdit, handleDelete]);

  // ── Render field helper (with red glow) ──
  const renderField = (label: string, field: keyof InventoryFormData, type: 'text' | 'number' | 'select' | 'textarea' = 'text', options?: any[], required = false) => {
    const value = (formData as any)[field] ?? '';
    const id = `field-${field}`;
    const hasError = formErrors[field];
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        {type === 'select' ? (
          <select
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
          >
            <option value="">Select {label}</option>
            {options?.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name || opt.title}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            rows={3}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
          />
        )}
      </div>
    );
  };

  // ── Loading state ──
  const isLoading = itemsLoading;

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Inventory Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiPackage className="text-cyan-300" /> Inventory
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Stock & Products</span>
          </h1>
          <p className="text-sm text-slate-300">Track products, stock levels, pricing, and reorder points</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { refreshComps(); refreshBranches(); refreshItems(); }} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, SKU, barcode, brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterCompany} onChange={(e) => { setFilterCompany(e.target.value); setFilterBranch('all'); }} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Companies</option>
            {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Branches</option>
            {filteredBranchesFilter.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="in_stock">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {items ? (
          <>
            <StatCard icon={FiBox} label="Total Items" value={summary.total} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} tone="rose" />
            <StatCard icon={FiAlertCircle} label="Low Stock" value={summary.lowStock} tone="amber" />
            <StatCard icon={FiTruck} label="Out of Stock" value={summary.outOfStock} tone="rose" />
            <StatCard icon={FiDollarSign} label="Total Value" value={summary.totalValue.toFixed(2)} tone="teal" prefix="₹" />
          </>
        ) : (
          [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Error */}
      {itemsError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiAlertCircle size={20} /> {itemsError}
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => { const qty = prompt('Enter new stock quantity:'); if (qty !== null && !isNaN(Number(qty)) && Number(qty) >= 0) handleBulkUpdateStock(Number(qty)); }} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600">
            <FiEdit size={16} /> Update Stock
          </button>
          <button onClick={() => handleBulkStatusChange(true)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">
            <FiCheckCircle size={16} /> Activate
          </button>
          <button onClick={() => handleBulkStatusChange(false)} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600">
            <FiXCircle size={16} /> Deactivate
          </button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Clear Selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Inventory Items"
                columns={columns}
                data={paginatedItems}
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
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredItems.length)} of {filteredItems.length}
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

      {/* View Offcanvas */}
      {isViewPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Item: ${viewingItem?.name || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
            footer={<div className="flex justify-end"><button onClick={() => setIsViewPanelOpen(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">Close</button></div>}
          >
            {viewingItem && (
              <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Basic Info</legend>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div><label className="block text-sm font-medium text-gray-700">Name</label><div className="font-semibold">{viewingItem.name}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">SKU</label><div>{viewingItem.sku}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Barcode</label><div>{viewingItem.barcode || '-'}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Brand</label><div>{viewingItem.brand || '-'}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Unit</label><div>{viewingItem.unit || '-'}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Company</label><div>{viewingItem.company?.name || '-'}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Branch</label><div>{viewingItem.branch?.name || '-'}</div></div>
                  </div>
                </fieldset>
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Pricing</legend>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div><label className="block text-sm font-medium text-gray-700">Purchase Price</label><div>₹{Number(viewingItem.purchase_price).toFixed(2)}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Sale Price</label><div className="font-bold">₹{Number(viewingItem.sale_price).toFixed(2)}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Tax Rate</label><div>{Number(viewingItem.tax_rate).toFixed(2)}%</div></div>
                  </div>
                </fieldset>
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Stock</legend>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div><label className="block text-sm font-medium text-gray-700">Current Stock</label><div>{viewingItem.stock_quantity}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Reorder Level</label><div>{viewingItem.reorder_level}</div></div>
                    <div><label className="block text-sm font-medium text-gray-700">Status</label><div><span className={`px-2 py-1 text-xs font-semibold rounded-full ${viewingItem.active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{viewingItem.active ? 'Active' : 'Inactive'}</span></div></div>
                  </div>
                </fieldset>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <div className="whitespace-pre-wrap text-sm mt-1">{viewingItem.description || '-'}</div>
                </div>
                <div className="text-xs text-slate-400">Created: {viewingItem.created_at ? new Date(viewingItem.created_at).toLocaleString() : '-'}</div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Form Offcanvas – Flat layout with auto‑SKU and image placeholder */}
      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading form...</div></div>}>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Item' : 'Add Item'}
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
              {/* Basic Information */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Basic Information
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Company *', 'company_id', 'select', companies?.map(c => ({ id: c.id, name: c.name })), true)}
                    {renderField('Branch', 'branch_id', 'select', filteredBranchesForm)}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Item Name *', 'name', 'text', undefined, true)}
                    {/* SKU auto‑generated, no button */}
                    <div>
                      <label htmlFor="field-sku" className="block text-sm font-medium text-gray-700 mb-1">
                        SKU <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="field-sku"
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${formErrors.sku ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
                        placeholder="FU-001"
                      />
                      <p className="text-xs text-slate-400 mt-1">Auto‑generated on name input</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Barcode', 'barcode')}
                    {renderField('Brand', 'brand')}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="field-unit" className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                      <select
                        id="field-unit"
                        value={formData.unit}
                        onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      >
                        {UNIT_OPTIONS.map(u => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </div>
                    {renderField('Description', 'description', 'textarea')}
                  </div>
                </div>
              </fieldset>

              {/* Pricing */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Pricing
                </legend>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  {renderField('Purchase Price (₹)', 'purchase_price', 'number')}
                  {renderField('Sale Price (₹) *', 'sale_price', 'number', undefined, true)}
                  {renderField('Tax Rate (%)', 'tax_rate', 'number')}
                </div>
              </fieldset>

              {/* Stock & Status */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Stock & Status
                </legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {renderField('Stock Quantity *', 'stock_quantity', 'number', undefined, true)}
                  {renderField('Reorder Level', 'reorder_level', 'number')}
                  <div className="flex items-center gap-2 col-span-2">
                    <input
                      type="checkbox"
                      id="active"
                      checked={formData.active}
                      onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                  </div>
                </div>
              </fieldset>

              {/* Image Upload – Coming Soon */}
              <fieldset className="border rounded-lg p-4 opacity-60">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span> Images
                </legend>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      disabled
                      className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                    />
                    <span className="text-xs text-gray-500 whitespace-nowrap">Coming Soon</span>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}