import { useEffect, useState, useCallback, useMemo, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiDownload, FiEye, FiEdit2,
  FiCheckCircle, FiXCircle, FiPackage, FiHome
} from 'react-icons/fi';
import clsx from 'clsx';

// ---------- Lazy loaded heavy components (named → default fix) ----------
const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';
import { formatDateTime, formatDate } from '../utils/date';

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
interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id: number; }
interface Warehouse {
  id: number;
  company_id: number;
  branch_id: number;
  company?: Company;
  branch?: Branch;
  name: string;
  code: string;
  location: string;
  active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface WarehouseFormData {
  company_id: number | string;
  branch_id: number | string;
  name: string;
  code: string;
  location: string;
  active: boolean;
}

// ---------- Skeleton Components ----------
const StatCardSkeleton = memo(() => (
  <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm animate-pulse">
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-slate-200" />
      <div className="space-y-2 flex-1">
        <div className="h-3 w-16 bg-slate-200 rounded" />
        <div className="h-6 w-8 bg-slate-200 rounded" />
      </div>
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
  icon: any;
  label: string;
  value: number;
  tone: 'blue' | 'emerald' | 'rose';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             'bg-rose-100 text-rose-600';
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm flex items-center gap-3">
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

// ---------- Data columns ----------
const dataColumns = [
  { name: 'Warehouse', selector: (row: Warehouse) => row.name, sortable: true },
  { name: 'Company', selector: (row: Warehouse) => row.company?.name || '-', sortable: true },
  { name: 'Branch', selector: (row: Warehouse) => row.branch?.name || '-', sortable: true },
  { name: 'Code', selector: (row: Warehouse) => row.code || '-' },
  { name: 'Location', selector: (row: Warehouse) => row.location || '-' },
  { name: 'Status', selector: (row: Warehouse) => (row.active ? 'Active' : 'Inactive'), sortable: true },
];

// ---------- Main Component ----------
export function WarehousesPage() {
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Filters
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Selection
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // View state
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingWarehouse, setViewingWarehouse] = useState<Warehouse | null>(null);

  // Form state
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<WarehouseFormData>({
    company_id: '', branch_id: '', name: '', code: '', location: '', active: true,
  });
  const [error, setError] = useState<string | null>(null);

  const { showSuccess, showError } = useNotification();

  // ---------- API Caching ----------
  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const {
    data: warehouses,
    loading: whLoading,
    error: whError,
    refresh: refreshWarehouses,
  } = useApiCache<Warehouse[]>('warehouses', () => apiClient.getWarehouses());

  // Derived data
  const filteredWarehouses = useMemo(() => {
    if (!warehouses) return [];
    let filtered = [...warehouses];
    if (filterCompany !== 'all') filtered = filtered.filter(w => w.company_id === parseInt(filterCompany));
    if (filterBranch !== 'all') filtered = filtered.filter(w => w.branch_id === parseInt(filterBranch));
    if (filterStatus !== 'all') filtered = filtered.filter(w => filterStatus === 'active' ? w.active : !w.active);
    return filtered;
  }, [warehouses, filterCompany, filterBranch, filterStatus]);

  const summary = useMemo(() => ({
    total: warehouses?.length || 0,
    active: warehouses?.filter(w => w.active).length || 0,
    inactive: warehouses?.filter(w => !w.active).length || 0,
  }), [warehouses]);

  // Pagination
  const totalPages = Math.ceil(filteredWarehouses.length / rowsPerPage);
  const paginatedWarehouses = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredWarehouses.slice(start, start + rowsPerPage);
  }, [filteredWarehouses, currentPage]);

  useEffect(() => setCurrentPage(1), [filterCompany, filterBranch, filterStatus]);

  // ---------- Branch filtering for form ----------
  const filteredBranchesForm = useMemo(() => {
    if (!formData.company_id || !branches) return [];
    return branches.filter(b => b.company_id === parseInt(String(formData.company_id)));
  }, [formData.company_id, branches]);

  // Branches for filter dropdown
  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter(b => b.company_id === parseInt(filterCompany));
    }
    return branches || [];
  }, [filterCompany, branches]);

  // ---------- Bulk actions ----------
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} warehouse(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deleteWarehouse(id)));
      showSuccess('Bulk delete', `${selectedIds.length} warehouse(s) deleted.`);
      addAppLog({ module: 'Warehouses', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length} warehouses` });
      setSelectedIds([]);
      refreshWarehouses();
    } catch (err: any) {
      showError('Bulk delete failed', err.message);
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${label} ${selectedIds.length} warehouse(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateWarehouse(id, { active } as any)));
      showSuccess('Bulk update', `${selectedIds.length} warehouse(s) ${label}d.`);
      addAppLog({ module: 'Warehouses', action: 'Bulk status change', status: 'success', message: `${label}d ${selectedIds.length} warehouses` });
      setSelectedIds([]);
      refreshWarehouses();
    } catch (err: any) {
      showError('Bulk update failed', err.message);
    }
  };

  // ---------- CRUD handlers ----------
  const handleView = (warehouse: Warehouse) => {
    setViewingWarehouse(warehouse);
    setIsViewPanelOpen(true);
  };

  const handleCreate = () => {
    setEditingId(null);
    setFormData({ company_id: '', branch_id: '', name: '', code: '', location: '', active: true });
    setError(null);
    setIsPanelOpen(true);
  };

  const handleEdit = (warehouse: Warehouse) => {
    setEditingId(warehouse.id);
    setFormData({
      company_id: warehouse.company_id || '',
      branch_id: warehouse.branch_id || '',
      name: warehouse.name || '',
      code: warehouse.code || '',
      location: warehouse.location || '',
      active: warehouse.active ?? true,
    });
    setError(null);
    setIsPanelOpen(true);
  };

  const handleDelete = async (warehouse: Warehouse) => {
    if (!confirm(`Delete warehouse "${warehouse.name}"?`)) return;
    try {
      await apiClient.deleteWarehouse(warehouse.id);
      showSuccess('Warehouse deleted', `"${warehouse.name}" removed.`);
      addAppLog({ module: 'Warehouses', action: 'Delete warehouse', status: 'success', message: `Deleted warehouse ${warehouse.name}` });
      refreshWarehouses();
    } catch (err: any) {
      showError('Delete failed', err.message);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.company_id) { setError('Company is required.'); return false; }
    if (!formData.branch_id) { setError('Branch is required.'); return false; }
    if (!formData.name.trim()) { setError('Warehouse name is required.'); return false; }
    setError(null);
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    const payload = {
      ...formData,
      company_id: parseInt(String(formData.company_id)),
      branch_id: parseInt(String(formData.branch_id)),
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateWarehouse(editingId, payload);
        showSuccess('Warehouse updated', `"${formData.name}" updated.`);
        addAppLog({ module: 'Warehouses', action: 'Update warehouse', status: 'success', message: `Updated warehouse ${formData.name}` });
      } else {
        await apiClient.createWarehouse(payload);
        showSuccess('Warehouse created', `"${formData.name}" created.`);
        addAppLog({ module: 'Warehouses', action: 'Create warehouse', status: 'success', message: `Created warehouse ${formData.name}` });
      }
      setIsPanelOpen(false);
      refreshWarehouses();
    } catch (err: any) {
      showError('Save failed', err.message);
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    if (filteredWarehouses.length === 0) {
      showError('Export failed', 'No warehouses to export.');
      return;
    }
    const headers = ['Warehouse Name', 'Company', 'Branch', 'Code', 'Location', 'Status'];
    const rows = filteredWarehouses.map(w => [
      w.name,
      w.company?.name || '',
      w.branch?.name || '',
      w.code || '',
      w.location || '',
      w.active ? 'Active' : 'Inactive',
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouses-${formatDate(new Date())}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Warehouses exported.');
  };

  // Table columns with actions
  const columnsWithActions = useMemo(() => [
    ...dataColumns,
    {
      name: 'Actions',
      cell: (row: Warehouse) => (
        <div className="flex gap-2">
          <button onClick={() => handleView(row)} className="text-blue-600 hover:text-blue-800" title="View">
            <FiEye size={18} />
          </button>
          <button onClick={() => handleEdit(row)} className="text-yellow-600 hover:text-yellow-800" title="Edit">
            <FiEdit2 size={18} />
          </button>
          <button onClick={() => handleDelete(row)} className="text-red-600 hover:text-red-800" title="Delete">
            <FiTrash2 size={18} />
          </button>
        </div>
      ),
      sortable: false,
      ignoreExport: true,
    },
  ], []);

  const isLoading = whLoading;

  // ---------- Render ----------
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header – dark purple (#29195A) with icon accents */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-[#020618] px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Inventory Management
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiPackage className="text-cyan-300" /> Warehouses
            <span className="text-sm font-normal text-cyan-100/70 ml-2">Directory</span>
          </h1>
          <p className="text-sm text-slate-300">Manage storage locations, branch assignments, and inventory staging points.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20">
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button onClick={refreshWarehouses} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 transition hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleCreate} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium transition hover:bg-cyan-300 shadow-md shadow-cyan-500/20">
            <FiPlus className="inline mr-1" size={14} /> Add Warehouse
          </button>
        </div>
      </div>

      {/* Summary Cards with skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {warehouses ? (
          <>
            <StatCard icon={FiPackage} label="Total Warehouses" value={summary.total} tone="blue" />
            <StatCard icon={FiCheckCircle} label="Active" value={summary.active} tone="emerald" />
            <StatCard icon={FiXCircle} label="Inactive" value={summary.inactive} tone="rose" />
          </>
        ) : (
          [...Array(3)].map((_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setFilterBranch('all'); }} className="input-field w-40 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
          <option value="all">All Companies</option>
          {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="input-field w-40 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
          <option value="all">All Branches</option>
          {filteredBranchesFilter.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field w-40 text-sm rounded-xl border-slate-200 bg-white py-2 px-3">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm mb-4 flex flex-wrap items-center gap-3 border border-slate-200">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => handleBulkStatusChange(true)} className="btn btn-success gap-2 text-sm">
            <FiCheckCircle size={16} /> Activate
          </button>
          <button onClick={() => handleBulkStatusChange(false)} className="btn btn-warning gap-2 text-sm">
            <FiXCircle size={16} /> Deactivate
          </button>
          <button onClick={handleBulkDelete} className="btn btn-danger gap-2 text-sm">
            <FiTrash2 size={16} /> Delete
          </button>
          <button onClick={() => setSelectedIds([])} className="btn btn-secondary text-sm">Clear</button>
        </div>
      )}

      {/* Error banner */}
      {(error || whError) && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiXCircle size={20} /> {error || whError}
        </div>
      )}

      {/* Table with skeleton & pagination */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <>
              <ModernDataTable
                title="Warehouse Directory"
                columns={columnsWithActions}
                data={paginatedWarehouses}
                loading={false}
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
              />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredWarehouses.length)} of {filteredWarehouses.length}
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

      {/* View Warehouse Offcanvas (lazy) */}
      {isViewPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isViewPanelOpen}
            title={`Warehouse ${viewingWarehouse?.name || ''}`}
            onClose={() => setIsViewPanelOpen(false)}
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button onClick={() => setIsViewPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto">Close</button>
              </div>
            }
          >
            {viewingWarehouse && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Warehouse Name</label>
                    <div className="mt-1 text-gray-900 font-semibold">{viewingWarehouse.name}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <div className="mt-1">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${viewingWarehouse.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {viewingWarehouse.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Company</label>
                  <div className="mt-1 text-gray-900">{viewingWarehouse.company?.name || '-'}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Branch</label>
                  <div className="mt-1 text-gray-900">{viewingWarehouse.branch?.name || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Code</label>
                    <div className="mt-1 text-gray-900">{viewingWarehouse.code || '-'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Location</label>
                    <div className="mt-1 text-gray-900 whitespace-pre-wrap">{viewingWarehouse.location || '-'}</div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Created At</label>
                  <div className="mt-1 text-gray-900">{viewingWarehouse.created_at ? formatDateTime(viewingWarehouse.created_at) : '-'}</div>
                </div>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Create/Edit Offcanvas (lazy) */}
      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading form...</div></div>}>
          <Offcanvas
            isOpen={isPanelOpen}
            title={editingId ? 'Edit Warehouse' : 'Create Warehouse'}
            onClose={() => setIsPanelOpen(false)}
            footer={
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button onClick={() => setIsPanelOpen(false)} className="btn btn-secondary w-full sm:w-auto" disabled={submitting}>Cancel</button>
                <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary w-full sm:w-auto">
                  {submitting ? 'Saving...' : editingId ? 'Update Warehouse' : 'Create Warehouse'}
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company <span className="text-red-500">*</span></label>
                <select
                  value={formData.company_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, company_id: e.target.value, branch_id: '' }))}
                  className="input-field w-full"
                  required
                >
                  <option value="">Select company</option>
                  {companies?.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch <span className="text-red-500">*</span></label>
                <select
                  value={formData.branch_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, branch_id: e.target.value }))}
                  className="input-field w-full"
                  disabled={!formData.company_id}
                  required
                >
                  <option value="">Select branch</option>
                  {filteredBranchesForm.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name <span className="text-red-500">*</span></label>
                <input type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="input-field w-full" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input type="text" value={formData.code} onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.active ? '1' : '0'}
                    onChange={e => setFormData(prev => ({ ...prev, active: e.target.value === '1' }))}
                    className="input-field w-full"
                  >
                    <option value="1">Active</option>
                    <option value="0">Inactive</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <textarea value={formData.location} onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))} className="input-field w-full min-h-[100px]" />
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </div>
  );
}