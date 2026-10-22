import { FormEvent, useEffect, useState, useCallback } from 'react';
import {
  FiBox,
  FiCheckCircle,
  FiPlus,
  FiRefreshCw,
  FiRepeat,
  FiTruck,
  FiX,
  FiAlertCircle,
  FiCheck,
} from 'react-icons/fi';
import apiClient from '../api';
import { useNotification } from '../components/NotificationContext';

interface TransferItem {
  id: number;
  product_id: number;
  requested_quantity: number;
  dispatched_quantity?: number;
  received_quantity?: number;
  unit_cost?: number;
  product?: {
    id: number;
    name: string;
    sku: string;
  };
}

interface TransferRecord {
  id: number;
  transfer_number: string;
  from_warehouse_id: number;
  to_warehouse_id: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'in_transit' | 'completed' | 'cancelled';
  transfer_date: string;
  notes?: string;
  from_warehouse?: { id: number; name: string };
  to_warehouse?: { id: number; name: string };
  items?: TransferItem[];
  created_at: string;
}

export function StockTransfersPage() {
  const { showSuccess, showError, showInfo } = useNotification();

  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: number; name: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: number; name: string; sku?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('10');
  const [fromWarehouseId, setFromWarehouseId] = useState<number | ''>('');
  const [toWarehouseId, setToWarehouseId] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getWmsTransfers();
      if (res?.success) {
        setTransfers(res.data?.data || res.data || []);
      }
    } catch (err: any) {
      showError('Failed to load transfers', err?.response?.data?.message || err?.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadDependencies = useCallback(async () => {
    try {
      const [whRes, prodRes] = await Promise.allSettled([
        apiClient.getWarehouses(),
        apiClient.getProducts(1),
      ]);

      if (whRes.status === 'fulfilled') {
        const whList = Array.isArray(whRes.value) ? whRes.value : (whRes.value as any)?.data || [];
        setWarehouses(whList);
        if (whList.length >= 2) {
          setFromWarehouseId(whList[0].id);
          setToWarehouseId(whList[1].id);
        } else if (whList.length === 1) {
          setFromWarehouseId(whList[0].id);
        }
      }

      if (prodRes.status === 'fulfilled') {
        const pList = Array.isArray(prodRes.value) ? prodRes.value : (prodRes.value as any)?.data || [];
        setProducts(pList);
        if (pList.length > 0) {
          setSelectedProductId(pList[0].id);
        }
      }
    } catch {
      // Safe fallback
    }
  }, []);

  useEffect(() => {
    loadDependencies();
    loadTransfers();
  }, [loadDependencies, loadTransfers]);

  const createTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProductId || !Number(quantity) || Number(quantity) <= 0) {
      showError('Validation Error', 'Please select a product and enter a valid quantity.');
      return;
    }

    if (!fromWarehouseId || !toWarehouseId) {
      showError('Validation Error', 'Please select both source and destination warehouses.');
      return;
    }

    if (fromWarehouseId === toWarehouseId) {
      showError('Validation Error', 'Source and destination warehouses cannot be the same.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.createWmsTransfer({
        from_warehouse_id: Number(fromWarehouseId),
        to_warehouse_id: Number(toWarehouseId),
        transfer_date: new Date().toISOString().split('T')[0],
        notes: notes || undefined,
        items: [
          {
            product_id: Number(selectedProductId),
            requested_quantity: Number(quantity),
          },
        ],
      });

      if (res?.success) {
        showSuccess('Transfer Created', 'Transfer order submitted in pending approval state.');
        setOpen(false);
        setNotes('');
        loadTransfers();
      }
    } catch (err: any) {
      showError('Transfer Failed', err?.response?.data?.message || err?.message || 'Could not initiate transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await apiClient.approveWmsTransfer(id);
      showSuccess('Transfer Approved', 'Stock transfer approved for warehouse staging.');
      loadTransfers();
    } catch (err: any) {
      showError('Approval Failed', err?.response?.data?.message || err?.message);
    }
  };

  const handleDispatch = async (id: number) => {
    try {
      await apiClient.dispatchWmsTransfer(id);
      showSuccess('Transfer Dispatched', 'Items deducted from source warehouse and in-transit.');
      loadTransfers();
    } catch (err: any) {
      showError('Dispatch Failed', err?.response?.data?.message || err?.message);
    }
  };

  const handleReceive = async (id: number) => {
    try {
      await apiClient.receiveWmsTransfer(id);
      showSuccess('Stock Received', 'Transfer marked as completed and inventory booked into destination.');
      loadTransfers();
    } catch (err: any) {
      showError('Receipt Failed', err?.response?.data?.message || err?.message);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this transfer order?')) return;
    try {
      await apiClient.cancelWmsTransfer(id, 'Cancelled by operator');
      showInfo('Transfer Cancelled', 'Transfer has been cancelled.');
      loadTransfers();
    } catch (err: any) {
      showError('Cancellation Failed', err?.response?.data?.message || err?.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Nixa WMS · Inter-Branch Logistics</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-950">Stock Transfers & Chain of Custody</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Move inventory between warehouses and branch stores with verified transit logs, gate dispatches, and destination receipts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={loadTransfers}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <FiRefreshCw className={`text-base ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              <FiPlus className="text-base" />
              New Stock Transfer
            </button>
          </div>
        </div>
      </section>

      {/* Main Table Card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Transfer #</th>
                <th className="px-4 py-3">Source Warehouse</th>
                <th className="px-4 py-3">Destination Warehouse</th>
                <th className="px-4 py-3">Items / Products</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <FiRepeat className="mx-auto text-3xl mb-2 text-slate-300" />
                    No transfer orders found. Click &quot;New Stock Transfer&quot; to initiate a move.
                  </td>
                </tr>
              ) : (
                transfers.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{item.transfer_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {item.from_warehouse?.name || `WH #${item.from_warehouse_id}`}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {item.to_warehouse?.name || `WH #${item.to_warehouse_id}`}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {item.items && item.items.length > 0 ? (
                        item.items.map((it) => (
                          <div key={it.id || it.product_id} className="font-medium text-slate-900">
                            {it.product?.name || `Product #${it.product_id}`} ·{' '}
                            <span className="font-bold text-indigo-600">{it.requested_quantity} units</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-400">No items listed</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{item.transfer_date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          item.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'in_transit'
                            ? 'bg-blue-100 text-blue-800'
                            : item.status === 'approved'
                            ? 'bg-purple-100 text-purple-800'
                            : item.status === 'pending_approval'
                            ? 'bg-amber-100 text-amber-800'
                            : item.status === 'cancelled'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      {item.status === 'pending_approval' && (
                        <>
                          <button
                            onClick={() => handleApprove(item.id)}
                            className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleCancel(item.id)}
                            className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {item.status === 'approved' && (
                        <button
                          onClick={() => handleDispatch(item.id)}
                          className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Dispatch (In-Transit)
                        </button>
                      )}
                      {item.status === 'in_transit' && (
                        <button
                          onClick={() => handleReceive(item.id)}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Receive & Restock
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* New Transfer Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Initiate Inter-Warehouse Transfer</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <FiX className="text-xl" />
              </button>
            </div>
            <form onSubmit={createTransfer} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Source Warehouse *</label>
                  <select
                    required
                    value={fromWarehouseId}
                    onChange={(e) => setFromWarehouseId(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                  >
                    <option value="">Select Source</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Destination Warehouse *</label>
                  <select
                    required
                    value={toWarehouseId}
                    onChange={(e) => setToWarehouseId(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                  >
                    <option value="">Select Destination</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Product SKU *</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                >
                  <option value="">Select Product</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Transfer Quantity (Units) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Transit Notes / Purpose</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Stock replenishment for North branch"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockTransfersPage;
