// src/pages/InventoryPage.tsx
import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo, DragEvent, ReactNode } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiDownload, FiEye, FiEdit,
  FiCheckCircle, FiXCircle, FiFilter, FiSearch, FiAlertCircle,
  FiPackage, FiBox, FiTruck, FiX, FiUpload, FiChevronDown,
  FiFile, FiCheck, FiAlertTriangle, FiDollarSign, FiMoreVertical,
  FiExternalLink, FiChevronRight, FiChevronLeft, FiUser, FiClock, FiMapPin
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const ModernDataTable = lazy(() => import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable })));
const Offcanvas = lazy(() => import('../components/Offcanvas').then(m => ({ default: m.Offcanvas })));

// ─── Types ─────────────────────────────────────────
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
  purchase_price: number | string;
  sale_price: number | string;
  tax_rate: number | string;
  stock_quantity: number | string;
  reorder_level: number | string;
  description: string | null;
  active: boolean | number | string;
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
type DuplicateAction = 'skip' | 'update' | 'stop';
interface ImportPreviewRow { row: number; data: Record<string, any>; valid: boolean; errors: Record<string, string>; sku: string; name: string; }
interface ImportSummary { total: number; valid: number; invalid: number; created?: number; updated?: number; skipped?: number; failed?: number; }
interface WarehouseStock { warehouse_id: number; warehouse_name: string; quantity: number; reserved_quantity: number; available_quantity: number; average_cost: number; last_purchase_price: number | null; }
interface StockMovementRecord {
  id: number;
  transaction_type: 'IN' | 'OUT';
  reference_type: string;
  reference_id: string | null;
  quantity: number;
  unit_price: number;
  stock_before: number;
  stock_after: number;
  remark: string | null;
  transaction_date: string;
  created_by: number;
  warehouse?: { id: number; name: string };
  creator?: { id: number; name: string };
}
interface TransactionRecord {
  type: 'sale' | 'purchase';
  bill_number: string;
  party_name: string;
  date: string;
  unit_price: number;
  price_with_tax: number;
  quantity: number;
  item_discount: number;
  item_net: number;
  item_total: number;
}
interface PurchasePriceRecord {
  id: number;
  product_id: number;
  supplier_id: number | null;
  purchase_id: number | null;
  bill_number: string | null;
  quantity: number;
  unit_price: number;
  purchase_date: string;
  supplier?: { id: number; name: string };
}

const UNIT_OPTIONS = ['Piece', 'Kg', 'Gram', 'Liter', 'Milliliter', 'Meter', 'Centimeter', 'Box', 'Carton', 'Set', 'Pack', 'Unit', 'Hour', 'Day', 'Month', 'Year', 'Dozen', 'Pair', 'Bundle', 'Bag', 'Roll', 'Sheet', 'Bottle', 'Can', 'Case', 'Pallet', 'Drum'];

// ─── Safe Helpers ─────────────────────────────────
function toFiniteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim());

  return Number.isFinite(number) ? number : fallback;
}

function toPositiveNumber(value: unknown): number | null {
  const number = toFiniteNumber(value, NaN);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function safeNumber(val: any): number {
  return toFiniteNumber(val, 0);
}

function safeCurrency(val: any): string {
  return `₹${safeNumber(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeDate(val: any): string {
  const d = new Date(val);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN');
}

function extractArray<T>(response: any): T[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.results?.data)) return response.results.data;
  return [];
}

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const err = error as any;

  const status = err?.response?.status;
  const message = err?.response?.data?.message;

  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested record was not found.';
  if (status === 409) return message || 'This operation conflicts with the current data.';
  if (status === 422) return message || 'Please check the submitted data.';
  if (status >= 500) return 'Server error. Please try again later.';

  return message || fallback;
}

function sanitizeCsvCell(value: unknown): string {
  const text = String(value ?? '');

  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function csvEscape(value: unknown): string {
  const sanitized = sanitizeCsvCell(value);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

// ─── API Cache (shared) ──────────────────────────
const apiCache = new Map<string, { data: any; timestamp: number }>();
// NOTE: In a real multi-tenant application, cache keys must include the current
// user/company/branch context. Without that, cached data may leak across tenants.
// This frontend cache is only for UI convenience; backend must enforce data isolation.
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = apiCache.get(key);
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
      let result: T;
      if (Array.isArray(res)) {
        result = res as T;
      } else {
        result = (res as any).data ?? [];
      }
      apiCache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error, 'Failed to load data');
      setError(msg);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [key, ttlMs]);

  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ─── Skeletons / Loader ──────────────────────────
const TypewriterLoader = memo(() => (
  <div className="flex flex-col items-center justify-center p-10">
    <div className="typewriter">
      <div className="slide"><i></i></div>
      <div className="paper"></div>
      <div className="keyboard"></div>
    </div>
    <p className="mt-6 text-sm text-slate-500 animate-pulse">Loading inventory…</p>
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

// ─── Stat Card ────────────────────────────────────
const StatCard = memo(({ icon: Icon, label, value, tone }: {
  icon: any; label: string; value: string | number; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
             tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
             tone === 'amber' ? 'bg-amber-100 text-amber-600' :
             tone === 'rose' ? 'bg-rose-100 text-rose-600' :
             tone === 'purple' ? 'bg-purple-100 text-purple-600' : 'bg-teal-100 text-teal-600';
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

// ─── Action Dropdown (fixed positioning) ──────────
const ActionDropdown = memo(({ item, onView, onEdit, onDelete }: {
  item: InventoryItem; onView: (i: InventoryItem) => void; onEdit: (i: InventoryItem) => void; onDelete: (i: InventoryItem) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);  // <-- added

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleScroll = () => setIsOpen(false);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuWidth = 160;
      const menuHeight = 132; // approx
      let top = rect.bottom + 4;
      let left = rect.right - menuWidth;

      // Viewport bounds
      if (left < 4) left = 4;
      if (left + menuWidth > window.innerWidth - 4) left = window.innerWidth - menuWidth - 4;
      if (top + menuHeight > window.innerHeight - 4) top = Math.max(4, rect.top - menuHeight - 4);

      setMenuPos({ top, left });
    }
    setIsOpen(prev => !prev);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
        title="Actions"
        aria-label="Product actions"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <FiMoreVertical size={16} />
      </button>
      {isOpen && (
        <div
          ref={dropdownRef}  // <-- added ref
          className="fixed z-[60] w-40 bg-white rounded-xl shadow-lg border border-slate-200 py-1"
          style={{ top: menuPos.top, left: menuPos.left }}
          role="menu"
        >
          <button type="button" onClick={() => { setIsOpen(false); onView(item); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
            <FiEye size={14} className="text-slate-500" /> View
          </button>
          <button type="button" onClick={() => { setIsOpen(false); onEdit(item); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
            <FiEdit size={14} className="text-blue-500" /> Edit
          </button>
          <div className="border-t border-slate-100 my-1"></div>
          <button type="button" onClick={() => { setIsOpen(false); onDelete(item); }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50" role="menuitem">
            <FiTrash2 size={14} /> Delete
          </button>
        </div>
      )}
    </>
  );
});

// ─── Modal System (shared) ────────────────────────
interface ModalProps { onClose: () => void; children: ReactNode; title?: string; width?: string; }
const Modal = ({ onClose, children, title, width = 'max-w-5xl' }: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousOverflow = useRef<string>('');

  useEffect(() => {
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);

    // Focus trap
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const first = modalRef.current?.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };
    focusFirst();

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow.current;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby={title ? 'modal-title' : undefined} className={`bg-white w-full ${width} rounded-2xl shadow-xl my-4`}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 id="modal-title" className="text-lg font-semibold text-slate-800">{title}</h2>
            <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close modal">
              <FiX size={20} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

// ─── iOS-style Tabs (React) ───────────────────────
const IosTabs = ({ tabs, activeTab, onChange }: { tabs: { key: string; label: string }[]; activeTab: string; onChange: (key: string) => void }) => {
  return (
    <div className="flex w-full justify-center bg-slate-100/50 p-4 rounded-xl">
      <div className="relative grid items-center rounded-full bg-white/70 p-1 shadow-inner" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        <div
          className="absolute top-1 left-1 h-[calc(100%-8px)] rounded-full bg-slate-900 shadow transition-transform duration-300"
          style={{
            width: `calc(${100 / tabs.length}% - 8px)`,
            transform: `translateX(${tabs.findIndex(t => t.key === activeTab) * 100}%)`
          }}
        />
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`relative z-10 rounded-full py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'text-white' : 'text-slate-500 hover:text-slate-700'
            }`}
            role="tab"
            aria-selected={activeTab === tab.key}
            tabIndex={activeTab === tab.key ? 0 : -1}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Product Detail Modal (fixed) ─────────────────
const ProductDetailModal = ({ product, onClose, onEdit, onStockIn, onStockOut }: {
  product: InventoryItem; onClose: () => void; onEdit: (i: InventoryItem) => void; onStockIn: (i: InventoryItem) => void; onStockOut: (i: InventoryItem) => void;
}) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [warehouseData, setWarehouseData] = useState<WarehouseStock[]>([]);
  const [movements, setMovements] = useState<StockMovementRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [priceHistory, setPriceHistory] = useState<PurchasePriceRecord[]>([]);
  const [priceList, setPriceList] = useState<any>(null);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [tabErrors, setTabErrors] = useState<Record<string, string>>({});
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const clearTabData = useCallback(() => {
    setSummaryData(null);
    setWarehouseData([]);
    setMovements([]);
    setTransactions([]);
    setPriceHistory([]);
    setPriceList(null);
  }, []);

  // Reset all data when product changes
  useEffect(() => {
    clearTabData();
    setActiveTab('summary');
    // Abort any in-flight requests from previous product
    controllersRef.current.forEach(controller => controller.abort());
    controllersRef.current.clear();
  }, [product.id, clearTabData]);

  const fetchTabData = useCallback(async (tabKey: string) => {
    if (controllersRef.current.has(tabKey)) {
      controllersRef.current.get(tabKey)?.abort();
    }
    const controller = new AbortController();
    controllersRef.current.set(tabKey, controller);

    setTabLoading(prev => ({ ...prev, [tabKey]: true }));
    setTabErrors(prev => ({ ...prev, [tabKey]: '' }));

    try {
      let res;
      switch (tabKey) {
        case 'summary':
        case 'warehouse':
          // Load both summary and warehouse data together for these tabs
          const [summaryRes, warehouseRes] = await Promise.all([
            apiClient.get(`/products/${product.id}/inventory-summary`, { signal: controller.signal }),
            apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal }),
          ]);
          setSummaryData(summaryRes.data);
          setWarehouseData(extractArray<WarehouseStock>(warehouseRes.data));
          break;
        case 'timeline':
          res = await apiClient.get(`/products/${product.id}/stock-movements?per_page=50`, { signal: controller.signal });
          setMovements(extractArray<StockMovementRecord>(res.data));
          break;
        case 'billwise':
          res = await apiClient.get(`/products/${product.id}/transactions`, { signal: controller.signal });
          setTransactions(extractArray<TransactionRecord>(res.data));
          break;
        case 'purchasehistory':
          res = await apiClient.get(`/products/${product.id}/purchase-price-history?per_page=50`, { signal: controller.signal });
          setPriceHistory(extractArray<PurchasePriceRecord>(res.data));
          break;
        case 'pricelist':
          res = await apiClient.get(`/products/${product.id}/price-list`, { signal: controller.signal });
          setPriceList(res.data);
          break;
        default:
          break;
      }
    } catch (error: unknown) {
      if ((error as any).name !== 'AbortError') {
        setTabErrors(prev => ({ ...prev, [tabKey]: getApiErrorMessage(error, 'Failed to load data.') }));
      }
    } finally {
      if (!controller.signal.aborted) {
        setTabLoading(prev => ({ ...prev, [tabKey]: false }));
      }
      controllersRef.current.delete(tabKey);
    }
  }, [product.id]);

  // Load initial data (summary + warehouse) when product changes
  useEffect(() => {
    fetchTabData('summary');
    fetchTabData('warehouse');
    return () => {
      // Cleanup all controllers when component unmounts
      controllersRef.current.forEach(controller => controller.abort());
    };
  }, [fetchTabData]);

  // Load specific tab data when active tab changes
  useEffect(() => {
    if (activeTab === 'summary' || activeTab === 'warehouse') return;
    fetchTabData(activeTab);
  }, [activeTab, fetchTabData]);

  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'billwise', label: 'Bill-Wise' },
    { key: 'party', label: 'Party' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'pricelist', label: 'Price List' },
    { key: 'purchasehistory', label: 'Purchase History' },
    { key: 'warehouse', label: 'Warehouse' },
  ];

  const partyGroups = useMemo(() => {
    if (!transactions.length) return [];
    const map = new Map<string, TransactionRecord[]>();
    transactions.forEach(t => {
      const key = t.party_name || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([party, items]) => ({ party, items }));
  }, [transactions]);

  const isLoading = tabLoading[activeTab] || false;
  const activeTabError = tabErrors[activeTab] || null;

  return (
    <Modal onClose={onClose} title={product.name} width="max-w-7xl">
      <div className="p-6">
        {summaryData && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <div><p className="text-xs text-slate-500">Sale Price</p><p className="font-bold">{safeCurrency(product.sale_price)}</p></div>
            <div><p className="text-xs text-slate-500">Total Stock</p><p className="font-bold">{summaryData.total_stock ?? 0}</p></div>
            <div><p className="text-xs text-slate-500">Available</p><p className="font-bold">{summaryData.available_stock ?? 0}</p></div>
            <div><p className="text-xs text-slate-500">Reserved</p><p className="font-bold">{summaryData.reserved_stock ?? 0}</p></div>
            <div><p className="text-xs text-slate-500">Avg Purchase</p><p className="font-bold">{safeCurrency(summaryData.average_purchase_price)}</p></div>
            <div><p className="text-xs text-slate-500">Last Purchase</p><p className="font-bold">{safeCurrency(summaryData.last_purchase_price)}</p></div>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button onClick={() => onEdit(product)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Edit</button>
          <button onClick={() => onStockIn(product)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">Stock IN</button>
          <button onClick={() => onStockOut(product)} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700">Stock OUT</button>
        </div>

        <IosTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        <div className="mt-6">
          {activeTabError && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg flex items-center gap-2">
              <FiAlertCircle size={18} /> {activeTabError}
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" /></div>
          ) : (
            <>
              {activeTab === 'summary' && summaryData && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Last Purchase Price</p>
                    <p className="text-lg font-bold">{safeCurrency(summaryData.last_purchase_price)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Average Purchase Price</p>
                    <p className="text-lg font-bold">{safeCurrency(summaryData.average_purchase_price)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Last Sale Price</p>
                    <p className="text-lg font-bold">{safeCurrency(summaryData.last_sale_price)}</p>
                  </div>
                </div>
              )}

              {activeTab === 'billwise' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Bill #</th>
                        <th className="px-3 py-2 text-left">Party</th>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Price w/Tax</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Discount</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{t.bill_number}</td>
                          <td className="px-3 py-2">{t.party_name}</td>
                          <td className="px-3 py-2">{safeDate(t.date)}</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(t.unit_price)}</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(t.price_with_tax)}</td>
                          <td className="px-3 py-2 text-right">{t.quantity}</td>
                          <td className="px-3 py-2 text-right">{safeNumber(t.item_discount)}%</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(t.item_total)}</td>
                        </tr>
                      ))}
                      {transactions.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">No transactions found</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'party' && (
                <div>
                  {partyGroups.length === 0 ? (
                    <p className="text-center py-8 text-slate-400">No party transactions found</p>
                  ) : (
                    <div className="space-y-6">
                      {partyGroups.map(group => (
                        <div key={group.party} className="border rounded-xl p-4">
                          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                            <FiUser size={16} className="text-blue-500" /> {group.party}
                          </h3>
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50">
                                <tr>
                                  <th className="px-3 py-2 text-left">Bill #</th>
                                  <th className="px-3 py-2 text-left">Date</th>
                                  <th className="px-3 py-2 text-right">Qty</th>
                                  <th className="px-3 py-2 text-right">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((t, i) => (
                                  <tr key={i} className="border-t">
                                    <td className="px-3 py-2">{t.bill_number}</td>
                                    <td className="px-3 py-2">{safeDate(t.date)}</td>
                                    <td className="px-3 py-2 text-right">{t.quantity}</td>
                                    <td className="px-3 py-2 text-right">{safeCurrency(t.item_total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  {movements.map((m) => (
                    <div key={m.id} className={`border-l-4 pl-4 py-2 ${m.transaction_type === 'IN' ? 'border-emerald-500' : 'border-rose-500'}`}>
                      <div className="flex justify-between">
                        <span className="font-medium">{m.transaction_type} {m.reference_type}</span>
                        <span className="text-sm text-slate-500">{safeDate(m.transaction_date)}</span>
                      </div>
                      <p className="text-sm">{safeNumber(m.quantity)} units | {safeNumber(m.stock_before)} → {safeNumber(m.stock_after)}</p>
                      {m.warehouse && <p className="text-xs text-slate-500"><FiMapPin size={12} className="inline mr-1" />{m.warehouse.name}</p>}
                      {m.creator && <p className="text-xs text-slate-400"><FiUser size={12} className="inline mr-1" />{m.creator.name}</p>}
                      {m.remark && <p className="text-xs text-slate-500">{m.remark}</p>}
                    </div>
                  ))}
                  {movements.length === 0 && <p className="text-center py-8 text-slate-400">No movements found</p>}
                </div>
              )}

              {activeTab === 'pricelist' && priceList && (
                <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><dt className="text-sm">Purchase Price</dt><dd className="font-bold">{safeCurrency(priceList.purchase_price)}</dd></div>
                  <div><dt className="text-sm">Sale Price</dt><dd className="font-bold">{safeCurrency(priceList.sale_price)}</dd></div>
                  <div><dt className="text-sm">MRP</dt><dd className="font-bold">{safeCurrency(priceList.mrp)}</dd></div>
                  <div><dt className="text-sm">Wholesale</dt><dd className="font-bold">{safeCurrency(priceList.wholesale_price)}</dd></div>
                  <div><dt className="text-sm">Dealer</dt><dd className="font-bold">{safeCurrency(priceList.dealer_price)}</dd></div>
                  <div><dt className="text-sm">Distributor</dt><dd className="font-bold">{safeCurrency(priceList.distributor_price)}</dd></div>
                </dl>
              )}

              {activeTab === 'purchasehistory' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Supplier</th>
                        <th className="px-3 py-2 text-left">Bill #</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-2">{safeDate(p.purchase_date)}</td>
                          <td className="px-3 py-2">{p.supplier?.name || '-'}</td>
                          <td className="px-3 py-2">{p.bill_number || '-'}</td>
                          <td className="px-3 py-2 text-right">{p.quantity}</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(p.unit_price)}</td>
                        </tr>
                      ))}
                      {priceHistory.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-slate-400">No purchase history</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'warehouse' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Warehouse</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Reserved</th>
                        <th className="px-3 py-2 text-right">Available</th>
                        <th className="px-3 py-2 text-right">Avg Cost</th>
                        <th className="px-3 py-2 text-right">Last Purchase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouseData.map((w) => (
                        <tr key={w.warehouse_id} className="border-t">
                          <td className="px-3 py-2">{w.warehouse_name}</td>
                          <td className="px-3 py-2 text-right">{safeNumber(w.quantity)}</td>
                          <td className="px-3 py-2 text-right">{safeNumber(w.reserved_quantity)}</td>
                          <td className="px-3 py-2 text-right">{safeNumber(w.available_quantity)}</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(w.average_cost)}</td>
                          <td className="px-3 py-2 text-right">{safeCurrency(w.last_purchase_price)}</td>
                        </tr>
                      ))}
                      {warehouseData.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-400">No warehouse records</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

// ─── Stock IN Modal ──────────────────────────────
const StockInModal = ({ product, onClose, onSuccess }: { product: InventoryItem; onClose: () => void; onSuccess: () => void }) => {
  const [form, setForm] = useState({
    warehouse_id: '',
    quantity: '',
    unit_cost: product.purchase_price?.toString() || '0',
    reference_type: 'manual',
    reference_id: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    remark: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useNotification();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseError, setWarehouseError] = useState('');
  const [selectedStock, setSelectedStock] = useState<number | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('/warehouses?per_page=all', { signal: controller.signal })
      .then(res => setWarehouses(extractArray<any>(res.data)))
      .catch((err: unknown) => {
        if ((err as any).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) return;
    const controller = new AbortController();
    apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then(res => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s: WarehouseStock) => s.warehouse_id === Number(form.warehouse_id));
        setSelectedStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => {
        if ((err as any).name !== 'AbortError') {
          setSelectedStock(null);
        }
      });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitCost = toFiniteNumber(form.unit_cost, NaN);
    if (!Number.isFinite(unitCost) || unitCost < 0) return 'Unit cost must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date)) return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date()) return 'Transaction date cannot be in the future.';
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      showError('Validation', validationError);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/products/${product.id}/stock-in`, {
        ...form,
        quantity: toPositiveNumber(form.quantity),
        unit_cost: toFiniteNumber(form.unit_cost, 0),
        idempotency_key: idempotencyKey,
      });
      showSuccess('Stock IN successful', `Added ${form.quantity} units.`);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      showError('Stock IN failed', getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Stock IN" width="max-w-md">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Product</label>
          <input type="text" value={product.name} disabled className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Warehouse *</label>
          <select value={form.warehouse_id} onChange={e => setForm({...form, warehouse_id: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Select Warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {warehouseError && <p className="text-xs text-rose-500 mt-1">{warehouseError}</p>}
          {selectedStock !== null && <p className="text-xs text-slate-500 mt-1">Current available: {selectedStock}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Quantity *</label>
          <input type="number" min="0" step="any" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Unit Cost</label>
          <input type="number" min="0" step="0.01" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Transaction Type</label>
          <select value={form.reference_type} onChange={e => setForm({...form, reference_type: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="manual">Manual</option>
            <option value="purchase">Purchase</option>
            <option value="return">Return</option>
            <option value="adjustment">Adjustment</option>
            <option value="opening_stock">Opening Stock</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reference / Bill Number</label>
          <input type="text" value={form.reference_id} onChange={e => setForm({...form, reference_id: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Transaction Date</label>
          <input type="date" value={form.transaction_date} onChange={e => setForm({...form, transaction_date: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Remark</label>
          <textarea value={form.remark} onChange={e => setForm({...form, remark: e.target.value})} rows={2} maxLength={2000} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? 'Processing...' : 'Stock IN'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Stock OUT Modal ──────────────────────────────
const StockOutModal = ({ product, onClose, onSuccess }: { product: InventoryItem; onClose: () => void; onSuccess: () => void }) => {
  const [form, setForm] = useState({
    warehouse_id: '',
    quantity: '',
    unit_price: product.sale_price?.toString() || '0',
    reference_type: 'manual',
    reference_id: '',
    transaction_date: new Date().toISOString().slice(0, 10),
    remark: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useNotification();
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [warehouseError, setWarehouseError] = useState('');
  const [availableStock, setAvailableStock] = useState<number | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  useEffect(() => {
    const controller = new AbortController();
    apiClient.get('/warehouses?per_page=all', { signal: controller.signal })
      .then(res => setWarehouses(extractArray<any>(res.data)))
      .catch((err: unknown) => {
        if ((err as any).name !== 'AbortError') {
          setWarehouseError(getApiErrorMessage(err, 'Failed to load warehouses.'));
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!form.warehouse_id) return;
    const controller = new AbortController();
    apiClient.get(`/products/${product.id}/warehouse-stock`, { signal: controller.signal })
      .then(res => {
        const stocks = extractArray<WarehouseStock>(res.data);
        const selected = stocks.find((s: WarehouseStock) => s.warehouse_id === Number(form.warehouse_id));
        setAvailableStock(selected ? selected.available_quantity : 0);
      })
      .catch((err: unknown) => {
        if ((err as any).name !== 'AbortError') {
          setAvailableStock(null);
        }
      });
    return () => controller.abort();
  }, [form.warehouse_id, product.id]);

  const validate = (): string | null => {
    if (!form.warehouse_id) return 'Select a warehouse.';
    const qty = toPositiveNumber(form.quantity);
    if (qty === null) return 'Enter a positive quantity.';
    const unitPrice = toFiniteNumber(form.unit_price, NaN);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return 'Unit price must be a non-negative number.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transaction_date)) return 'Invalid date format. Use YYYY-MM-DD.';
    if (new Date(form.transaction_date) > new Date()) return 'Transaction date cannot be in the future.';
    if (availableStock !== null && qty > availableStock) {
      return `Insufficient stock. Available: ${availableStock}, Requested: ${qty}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      showError('Validation', validationError);
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(`/products/${product.id}/stock-out`, {
        ...form,
        quantity: toPositiveNumber(form.quantity),
        unit_price: toFiniteNumber(form.unit_price, 0),
        idempotency_key: idempotencyKey,
      });
      showSuccess('Stock OUT successful', `Removed ${form.quantity} units.`);
      onSuccess();
      onClose();
    } catch (error: unknown) {
      showError('Stock OUT failed', getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Stock OUT" width="max-w-md">
      <div className="p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Product</label>
          <input type="text" value={product.name} disabled className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-slate-50" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Warehouse *</label>
          <select value={form.warehouse_id} onChange={e => setForm({...form, warehouse_id: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="">Select Warehouse</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {warehouseError && <p className="text-xs text-rose-500 mt-1">{warehouseError}</p>}
          {availableStock !== null && <p className="text-xs text-slate-500 mt-1">Available stock: {availableStock}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Quantity *</label>
          <input type="number" min="0" step="any" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Unit Price</label>
          <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Transaction Type</label>
          <select value={form.reference_type} onChange={e => setForm({...form, reference_type: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2">
            <option value="manual">Manual</option>
            <option value="sale">Sale</option>
            <option value="return">Return</option>
            <option value="adjustment">Adjustment</option>
            <option value="transfer">Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reference / Bill Number</label>
          <input type="text" value={form.reference_id} onChange={e => setForm({...form, reference_id: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Transaction Date</label>
          <input type="date" value={form.transaction_date} onChange={e => setForm({...form, transaction_date: e.target.value})} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Remark</label>
          <textarea value={form.remark} onChange={e => setForm({...form, remark: e.target.value})} rows={2} maxLength={2000} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50">
            {submitting ? 'Processing...' : 'Stock OUT'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Main Component ────────────────────────────────
export function InventoryPage() {
  const { showSuccess, showError } = useNotification();
  const { data: companies, refresh: refreshComps } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches, refresh: refreshBranches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: items, loading: itemsLoading, error: itemsError, refresh: refreshItems } = useApiCache<InventoryItem[]>('inventory', () => apiClient.getAllProducts());

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isViewPanelOpen, setIsViewPanelOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<InventoryItem | null>(null);
  const [showStockIn, setShowStockIn] = useState(false);
  const [showStockOut, setShowStockOut] = useState(false);
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
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Import state
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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const brands = useMemo(() => {
    if (!items) return [];
    const br = new Set<string>();
    items.forEach(i => { if (i.brand) br.add(i.brand); });
    return Array.from(br);
  }, [items]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    let filtered = [...items];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(item =>
        String(item.name ?? '').toLowerCase().includes(term) ||
        String(item.sku ?? '').toLowerCase().includes(term) ||
        String(item.barcode ?? '').toLowerCase().includes(term) ||
        String(item.brand ?? '').toLowerCase().includes(term) ||
        String(item.description ?? '').toLowerCase().includes(term)
      );
    }
    if (filterCompany !== 'all') filtered = filtered.filter(i => String(i.company_id) === filterCompany);
    if (filterBranch !== 'all') filtered = filtered.filter(i => String(i.branch_id) === filterBranch);
    if (filterBrand !== 'all') filtered = filtered.filter(i => i.brand === filterBrand);
    if (filterStatus !== 'all') {
      filtered = filtered.filter(item => {
        const stock = safeNumber(item.stock_quantity);
        const reorder = safeNumber(item.reorder_level);
        const isActive = toBoolean(item.active);

        switch (filterStatus) {
          case 'active':
            return isActive;
          case 'inactive':
            return !isActive;
          case 'in_stock':
            return stock > reorder;
          case 'low':
            return stock > 0 && stock <= reorder;
          case 'out':
            return stock <= 0;
          default:
            return true;
        }
      });
    }
    return filtered;
  }, [items, searchTerm, filterCompany, filterBranch, filterBrand, filterStatus]);

  const summary = useMemo(() => {
    if (!items) return { total: 0, active: 0, inactive: 0, lowStock: 0, outOfStock: 0, totalValue: 0 };
    return {
      total: items.length,
      active: items.filter(i => toBoolean(i.active)).length,
      inactive: items.filter(i => !toBoolean(i.active)).length,
      lowStock: items.filter(i => safeNumber(i.stock_quantity) > 0 && safeNumber(i.stock_quantity) <= safeNumber(i.reorder_level)).length,
      outOfStock: items.filter(i => safeNumber(i.stock_quantity) <= 0).length,
      // Note: this is an estimate based on sale price, not authoritative inventory value.
      totalValue: items.reduce((sum, i) => sum + safeNumber(i.sale_price) * safeNumber(i.stock_quantity), 0),
    };
  }, [items]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredItems.length / rowsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredItems.slice(start, start + rowsPerPage);
  }, [filteredItems, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
    // Remove stale selected IDs that no longer exist in filtered items
    setSelectedIds(prev => prev.filter(id => items?.some(item => item.id === id)));
  }, [searchTerm, filterCompany, filterBranch, filterBrand, filterStatus, items]);

  const filteredBranchesForm = useMemo(() => {
    if (formData.company_id && branches) {
      const companyId = String(formData.company_id);
      return branches.filter(b => String(b.company_id) === companyId);
    }
    return [];
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      return branches.filter(b => String(b.company_id) === filterCompany);
    }
    return branches || [];
  }, [filterCompany, branches]);

  // Bulk actions with partial failure reporting
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} item(s)?`)) return;
    try {
      const results = await Promise.allSettled(selectedIds.map(id => apiClient.deleteProduct(id)));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed === 0) {
        showSuccess('Bulk delete', `${succeeded} item(s) deleted.`);
      } else {
        showError('Bulk delete', `${succeeded} deleted, ${failed} failed. Please check server logs.`);
      }
      setSelectedIds([]);
      refreshItems();
    } catch (error: unknown) {
      showError('Bulk delete failed', getApiErrorMessage(error));
    }
  };

  const handleBulkStatusChange = async (active: boolean) => {
    if (selectedIds.length === 0) return;
    const label = active ? 'activate' : 'deactivate';
    if (!confirm(`Are you sure you want to ${label} ${selectedIds.length} item(s)?`)) return;
    try {
      const results = await Promise.allSettled(selectedIds.map(id => apiClient.updateProduct(id, { active } as any)));
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed === 0) {
        showSuccess('Bulk update', `${succeeded} item(s) ${label}d.`);
      } else {
        showError('Bulk update', `${succeeded} ${label}d, ${failed} failed.`);
      }
      setSelectedIds([]);
      refreshItems();
    } catch (error: unknown) {
      showError('Bulk update failed', getApiErrorMessage(error));
    }
  };

  // Bulk stock update is dangerous; we prevent direct overwrite and show message.
  const handleBulkUpdateStock = async (quantity: number) => {
    showError('Disabled', 'Direct bulk stock overwrite is not allowed. Use Stock IN/OUT or a proper stock adjustment flow.');
    // In production, a dedicated bulk adjustment endpoint should be used:
    // await apiClient.bulkAdjustStock({ ids: selectedIds, quantity, reason: 'manual_adjustment' });
  };

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
      active: toBoolean(item.active),
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
    } catch (error: unknown) {
      showError('Delete failed', getApiErrorMessage(error));
    }
  }, [refreshItems, showSuccess, showError]);

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    let valid = true;

    // Company required and must be positive integer
    const companyId = Number(formData.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      errors.company_id = 'Select a company.';
      valid = false;
    }

    // Branch if provided must belong to selected company
    const branchId = formData.branch_id ? Number(formData.branch_id) : null;
    if (branchId !== null) {
      if (!Number.isInteger(branchId) || branchId <= 0) {
        errors.branch_id = 'Invalid branch.';
        valid = false;
      } else if (branches) {
        const branch = branches.find(b => b.id === branchId);
        if (!branch || branch.company_id !== companyId) {
          errors.branch_id = 'Branch does not belong to the selected company.';
          valid = false;
        }
      }
    }

    const name = formData.name.trim();
    if (!name) {
      errors.name = 'Name is required.';
      valid = false;
    } else if (name.length > 255) {
      errors.name = 'Name must be 255 characters or less.';
      valid = false;
    }

    const sku = formData.sku.trim();
    if (!sku) {
      errors.sku = 'SKU is required.';
      valid = false;
    } else if (sku.length > 100) {
      errors.sku = 'SKU must be 100 characters or less.';
      valid = false;
    }

    if (formData.barcode && formData.barcode.length > 100) {
      errors.barcode = 'Barcode must be 100 characters or less.';
      valid = false;
    }

    if (formData.brand && formData.brand.length > 150) {
      errors.brand = 'Brand must be 150 characters or less.';
      valid = false;
    }

    if (formData.description && formData.description.length > 5000) {
      errors.description = 'Description must be 5000 characters or less.';
      valid = false;
    }

    const purchasePrice = toFiniteNumber(formData.purchase_price, NaN);
    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
      errors.purchase_price = 'Purchase price must be a non-negative number.';
      valid = false;
    }

    const salePrice = toFiniteNumber(formData.sale_price, NaN);
    if (!Number.isFinite(salePrice) || salePrice < 0) {
      errors.sale_price = 'Sale price must be a non-negative number.';
      valid = false;
    }

    const taxRate = toFiniteNumber(formData.tax_rate, NaN);
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      errors.tax_rate = 'Tax rate must be between 0 and 100.';
      valid = false;
    }

    const stockQuantity = toFiniteNumber(formData.stock_quantity, NaN);
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      errors.stock_quantity = 'Stock quantity must be a non-negative number.';
      valid = false;
    }

    const reorderLevel = toFiniteNumber(formData.reorder_level, NaN);
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      errors.reorder_level = 'Reorder level must be a non-negative number.';
      valid = false;
    }

    setFormErrors(errors);
    if (!valid) {
      showError('Validation', 'Please fix the highlighted fields.');
    }
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;

    // Explicit payload with only allowed fields
    const payload = {
      company_id: Number(formData.company_id),
      branch_id: formData.branch_id ? Number(formData.branch_id) : null,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim() || null,
      brand: formData.brand.trim() || null,
      unit: formData.unit,
      purchase_price: toFiniteNumber(formData.purchase_price, 0),
      sale_price: toFiniteNumber(formData.sale_price, 0),
      tax_rate: toFiniteNumber(formData.tax_rate, 0),
      stock_quantity: toFiniteNumber(formData.stock_quantity, 0),
      reorder_level: toFiniteNumber(formData.reorder_level, 0),
      description: formData.description.trim() || null,
      active: formData.active,
    };

    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateProduct(editingId, payload);
        showSuccess('Item updated', `"${payload.name}" updated.`);
        addAppLog({ module: 'Inventory', action: 'Update', status: 'success', message: `Updated ${payload.name}` });
      } else {
        await apiClient.createProduct(payload);
        showSuccess('Item created', `"${payload.name}" created.`);
        addAppLog({ module: 'Inventory', action: 'Create', status: 'success', message: `Created ${payload.name}` });
      }
      setIsPanelOpen(false);
      refreshItems();
      refreshComps();
      refreshBranches();
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Save failed', msg);
      addAppLog({ module: 'Inventory', action: 'Save', status: 'error', message: msg });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshItems, refreshComps, refreshBranches, showSuccess, showError]);

  const handleExport = useCallback(async (mode: 'current' | 'selected' | 'all') => {
    try {
      let params: any = {};
      if (mode === 'current') {
        params = {
          search: searchTerm || undefined,
          company_id: filterCompany !== 'all' ? filterCompany : undefined,
          branch_id: filterBranch !== 'all' ? filterBranch : undefined,
          brand: filterBrand !== 'all' ? filterBrand : undefined,
          status: filterStatus !== 'all' ? filterStatus : undefined,
        };
      } else if (mode === 'selected') {
        if (selectedIds.length === 0) {
          showError('Export', 'No items selected.');
          return;
        }
        params.selected_ids = selectedIds;
      }
      const blob = await apiClient.exportInventory(params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Export', 'Inventory exported successfully.');
      addAppLog({ module: 'Inventory', action: 'Export', status: 'success', message: `Exported ${mode} view` });
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Export failed', msg);
      addAppLog({ module: 'Inventory', action: 'Export', status: 'error', message: msg });
    }
    setExportMenuOpen(false);
  }, [searchTerm, filterCompany, filterBranch, filterBrand, filterStatus, selectedIds, showSuccess, showError]);

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
      const response = await apiClient.importInventory(file, duplicateAction, true);
      // Validate response shape defensively
      const preview = Array.isArray(response?.preview) ? response.preview : [];
      const errors = Array.isArray(response?.errors) ? response.errors : [];
      setImportPreview(preview);
      setImportSummary({
        total: response?.total ?? preview.length,
        valid: response?.valid ?? 0,
        invalid: response?.invalid ?? preview.length,
      });
      setImportErrors(errors);
      setImportStep('preview');
    } catch (error: unknown) {
      showError('Preview failed', getApiErrorMessage(error));
      setImportStep('select');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    // Validate duplicateAction enum
    const allowedDuplicateActions: DuplicateAction[] = ['skip', 'update', 'stop'];
    if (!allowedDuplicateActions.includes(duplicateAction)) {
      setDuplicateAction('skip');
    }
    setImportLoading(true);
    try {
      const response = await apiClient.importInventory(importFile, duplicateAction, false);
      setImportSummary(response?.summary ?? null);
      setImportErrors(Array.isArray(response?.errors) ? response.errors : []);
      setImportResultMessage(response?.message ?? '');
      setImportSuccess(Boolean(response?.success));
      setImportStep('result');
      if (response?.success) {
        showSuccess('Import completed', response.message);
        refreshItems();
        addAppLog({ module: 'Inventory', action: 'Import', status: 'success', message: `Imported ${response.summary?.created ?? 0} items` });
      } else {
        showError('Import failed', response?.message || 'Please check errors.');
        addAppLog({ module: 'Inventory', action: 'Import', status: 'error', message: response?.message });
      }
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error);
      showError('Import failed', msg);
      setImportStep('preview');
      addAppLog({ module: 'Inventory', action: 'Import', status: 'error', message: msg });
    } finally {
      setImportLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory_template.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showSuccess('Template downloaded', 'Ready for import.');
    } catch (error: unknown) {
      showError('Template download failed', getApiErrorMessage(error));
    }
  };

  const handleDownloadErrorReport = () => {
    if (importErrors.length === 0) return;
    const headers = ['Row', 'Field', 'Error'];
    const rows = importErrors.map(e => [e.row, e.field, e.message]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => csvEscape(cell)).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'import_errors.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const columns = useMemo(() => [
    {
      name: 'ID',
      selector: (row: InventoryItem) => row.id,
      sortable: true,
      cell: (row: InventoryItem) => <span className="text-sm text-slate-500 font-mono">#{row.id}</span>,
      width: '70px',
      center: true,
    },
    {
      name: 'Name',
      selector: (row: InventoryItem) => row.name,
      sortable: true,
      cell: (row: InventoryItem) => (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
            {String(row.name ?? 'P').charAt(0).toUpperCase()}
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
      selector: (row: InventoryItem) => safeNumber(row.stock_quantity),
      sortable: true,
      cell: (row: InventoryItem) => {
        const qty = safeNumber(row.stock_quantity);
        const level = safeNumber(row.reorder_level);
        let color = 'text-slate-700';
        if (qty <= 0) color = 'text-rose-600 font-medium';
        else if (qty <= level) color = 'text-amber-600 font-medium';
        return <span className={`text-sm ${color}`}>{qty}</span>;
      },
      width: '90px',
    },
    {
      name: 'Sale Price',
      selector: (row: InventoryItem) => safeNumber(row.sale_price),
      sortable: true,
      cell: (row: InventoryItem) => <span className="font-medium">{safeCurrency(row.sale_price)}</span>,
      width: '120px',
    },
    {
      name: 'Status',
      selector: (row: InventoryItem) => toBoolean(row.active) ? 'Active' : 'Inactive',
      cell: (row: InventoryItem) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${toBoolean(row.active) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
          {toBoolean(row.active) ? 'Active' : 'Inactive'}
        </span>
      ),
      sortable: true,
      width: '110px',
    },
    {
      name: 'Actions',
      cell: (row: InventoryItem) => (
        <ActionDropdown item={row} onView={handleView} onEdit={handleEdit} onDelete={handleDelete} />
      ),
      width: '70px',
      center: true,
    },
  ], [handleView, handleEdit, handleDelete]);

  const renderField = (label: string, field: keyof InventoryFormData, type: 'text' | 'number' | 'select' | 'textarea' = 'text', options?: any[], required = false) => {
    const value = (formData as any)[field] ?? '';
    const id = `field-${field}`;
    const errorMsg = formErrors[field];
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
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${errorMsg ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            aria-invalid={!!errorMsg}
            aria-describedby={errorMsg ? `${id}-error` : undefined}
          >
            <option value="">Select {label}</option>
            {options?.map(opt => <option key={opt.id} value={opt.id}>{opt.name || opt.title}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            rows={3}
            maxLength={5000}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${errorMsg ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
            aria-invalid={!!errorMsg}
            aria-describedby={errorMsg ? `${id}-error` : undefined}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${errorMsg ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
            aria-invalid={!!errorMsg}
            aria-describedby={errorMsg ? `${id}-error` : undefined}
          />
        )}
        {errorMsg && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{errorMsg}</p>}
      </div>
    );
  };

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
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { refreshComps(); refreshBranches(); refreshItems(); }} disabled={isLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60">
            <FiRefreshCw className={isLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button onClick={handleImportOpen} className="rounded-xl bg-emerald-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-emerald-300 shadow-md shadow-emerald-500/20">
            <FiUpload className="inline mr-1" size={14} /> Import
          </button>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 flex items-center gap-1"
            >
              <FiDownload className="inline" size={14} /> Export <FiChevronDown size={14} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-10">
                <button onClick={() => handleExport('current')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Export Current View
                </button>
                <button onClick={() => handleExport('selected')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={selectedIds.length === 0}>
                  Export Selected ({selectedIds.length})
                </button>
                <button onClick={() => handleExport('all')} className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  Export All
                </button>
              </div>
            )}
          </div>
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
            <StatCard icon={FiDollarSign} label="Total Value (Est.)" value={summary.totalValue.toFixed(2)} tone="teal" prefix="₹" />
          </>
        ) : (
          [...Array(6)].map((_, i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="space-y-2 flex-1">
              <div className="h-3 w-16 bg-slate-200 rounded" />
              <div className="h-6 w-8 bg-slate-200 rounded" />
            </div>
          </div>)
        )}
      </div>

      {/* Error */}
      {itemsError && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
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
            <TypewriterLoader />
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
                <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredItems.length)} of {filteredItems.length}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">««</button>
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">‹</button>
                    <span className="px-3 py-1 text-sm font-medium bg-slate-100 rounded-lg">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">›</button>
                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50">»»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {/* Product Detail Modal */}
      {isViewPanelOpen && viewingItem && (
        <ProductDetailModal
          product={viewingItem}
          onClose={() => setIsViewPanelOpen(false)}
          onEdit={(item) => {
            setIsViewPanelOpen(false);
            handleEdit(item);
          }}
          onStockIn={(item) => {
            setIsViewPanelOpen(false);
            setViewingItem(item);
            setShowStockIn(true);
          }}
          onStockOut={(item) => {
            setIsViewPanelOpen(false);
            setViewingItem(item);
            setShowStockOut(true);
          }}
        />
      )}

      {/* Stock In Modal */}
      {showStockIn && viewingItem && (
        <StockInModal product={viewingItem} onClose={() => setShowStockIn(false)} onSuccess={() => refreshItems()} />
      )}

      {/* Stock Out Modal */}
      {showStockOut && viewingItem && (
        <StockOutModal product={viewingItem} onClose={() => setShowStockOut(false)} onSuccess={() => refreshItems()} />
      )}

      {/* Form Offcanvas */}
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
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Company *', 'company_id', 'select', companies?.map(c => ({ id: c.id, name: c.name })), true)}
                    {renderField('Branch', 'branch_id', 'select', filteredBranchesForm)}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Item Name *', 'name', 'text', undefined, true)}
                    <div>
                      <label htmlFor="field-sku" className="block text-sm font-medium text-gray-700 mb-1">SKU <span className="text-red-500">*</span></label>
                      <input
                        id="field-sku"
                        type="text"
                        value={formData.sku}
                        onChange={(e) => setFormData(prev => ({ ...prev, sku: e.target.value }))}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${formErrors.sku ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
                        placeholder="FU-001"
                        maxLength={100}
                      />
                      {formErrors.sku && <p className="text-xs text-red-500 mt-1">{formErrors.sku}</p>}
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
                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    {renderField('Description', 'description', 'textarea')}
                  </div>
                </div>
              </fieldset>

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Pricing</legend>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  {renderField('Purchase Price (₹)', 'purchase_price', 'number')}
                  {renderField('Sale Price (₹) *', 'sale_price', 'number', undefined, true)}
                  {renderField('Tax Rate (%)', 'tax_rate', 'number')}
                </div>
              </fieldset>

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Stock & Status</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {renderField('Stock Quantity *', 'stock_quantity', 'number', undefined, true)}
                  {renderField('Reorder Level', 'reorder_level', 'number')}
                  <div className="flex items-center gap-2 col-span-2">
                    <input type="checkbox" id="active" checked={formData.active} onChange={(e) => setFormData(prev => ({ ...prev, active: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <label htmlFor="active" className="text-sm text-gray-700">Active</label>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Import Offcanvas */}
      {isImportOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isImportOpen}
            title="Import Inventory"
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
                  <button onClick={() => { setIsImportOpen(false); refreshItems(); }} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
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
                    Upload a CSV file to import inventory items. The file must match the required format. You can download a template below.
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
                      <span className="text-sm font-medium">Duplicate SKU:</span>
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
                              <th className="px-3 py-2 text-left">SKU</th>
                              <th className="px-3 py-2 text-left">Barcode</th>
                              <th className="px-3 py-2 text-left">Company</th>
                              <th className="px-3 py-2 text-left">Branch</th>
                              <th className="px-3 py-2 text-left">Sale Price</th>
                              <th className="px-3 py-2 text-left">Stock</th>
                              <th className="px-3 py-2 text-left">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 50).map((row) => (
                              <tr key={row.row} className={`border-b ${row.valid ? '' : 'bg-rose-50'}`}>
                                <td className="px-3 py-2">{row.row}</td>
                                <td className="px-3 py-2">{row.data.name || '-'}</td>
                                <td className="px-3 py-2">{row.data.sku || '-'}</td>
                                <td className="px-3 py-2">{row.data.barcode || '-'}</td>
                                <td className="px-3 py-2">{row.data.company_id || '-'}</td>
                                <td className="px-3 py-2">{row.data.branch_id || '-'}</td>
                                <td className="px-3 py-2">{row.data.sale_price ?? '-'}</td>
                                <td className="px-3 py-2">{row.data.stock_quantity ?? '-'}</td>
                                <td className="px-3 py-2">{row.valid ? <FiCheck className="text-emerald-600" /> : <FiAlertTriangle className="text-rose-600" title={Object.values(row.errors).join(', ')} />}</td>
                              </tr>
                            ))}
                            {importPreview.length > 50 && <tr><td colSpan={9} className="px-3 py-2 text-center text-slate-500">... and {importPreview.length - 50} more rows</td></tr>}
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
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .typewriter {
          --blue: #5C86FF;
          --blue-dark: #275EFE;
          --key: #fff;
          --paper: #EEF0FD;
          --text: #D3D4EC;
          --tool: #FBC56C;
          --duration: 3s;
          position: relative;
          -webkit-animation: bounce05 var(--duration) linear infinite;
          animation: bounce05 var(--duration) linear infinite;
        }
        .typewriter .slide {
          width: 92px;
          height: 20px;
          border-radius: 3px;
          margin-left: 14px;
          transform: translateX(14px);
          background: linear-gradient(var(--blue), var(--blue-dark));
          -webkit-animation: slide05 var(--duration) ease infinite;
          animation: slide05 var(--duration) ease infinite;
        }
        .typewriter .slide:before, .typewriter .slide:after, .typewriter .slide i:before {
          content: "";
          position: absolute;
          background: var(--tool);
        }
        .typewriter .slide:before { width: 2px; height: 8px; top: 6px; left: 100%; }
        .typewriter .slide:after { left: 94px; top: 3px; height: 14px; width: 6px; border-radius: 3px; }
        .typewriter .slide i { display: block; position: absolute; right: 100%; width: 6px; height: 4px; top: 4px; background: var(--tool); }
        .typewriter .slide i:before { right: 100%; top: -2px; width: 4px; border-radius: 2px; height: 14px; }
        .typewriter .paper {
          position: absolute; left: 24px; top: -26px; width: 40px; height: 46px; border-radius: 5px; background: var(--paper);
          transform: translateY(46px);
          -webkit-animation: paper05 var(--duration) linear infinite;
          animation: paper05 var(--duration) linear infinite;
        }
        .typewriter .paper:before {
          content: ""; position: absolute; left: 6px; right: 6px; top: 7px; border-radius: 2px; height: 4px; transform: scaleY(0.8); background: var(--text);
          box-shadow: 0 12px 0 var(--text), 0 24px 0 var(--text), 0 36px 0 var(--text);
        }
        .typewriter .keyboard {
          width: 120px; height: 56px; margin-top: -10px; z-index: 1; position: relative;
        }
        .typewriter .keyboard:before, .typewriter .keyboard:after { content: ""; position: absolute; }
        .typewriter .keyboard:before { top: 0; left: 0; right: 0; bottom: 0; border-radius: 7px; background: linear-gradient(135deg, var(--blue), var(--blue-dark)); transform: perspective(10px) rotateX(2deg); transform-origin: 50% 100%; }
        .typewriter .keyboard:after {
          left: 2px; top: 25px; width: 11px; height: 4px; border-radius: 2px;
          box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key);
          -webkit-animation: keyboard05 var(--duration) linear infinite;
          animation: keyboard05 var(--duration) linear infinite;
        }
        @keyframes bounce05 {
          85%, 92%, 100% { transform: translateY(0); }
          89% { transform: translateY(-4px); }
          95% { transform: translateY(2px); }
        }
        @keyframes slide05 {
          5% { transform: translateX(14px); }
          15%, 30% { transform: translateX(6px); }
          40%, 55% { transform: translateX(0); }
          65%, 70% { transform: translateX(-4px); }
          80%, 89% { transform: translateX(-12px); }
          100% { transform: translateX(14px); }
        }
        @keyframes paper05 {
          5% { transform: translateY(46px); }
          20%, 30% { transform: translateY(34px); }
          40%, 55% { transform: translateY(22px); }
          65%, 70% { transform: translateY(10px); }
          80%, 85% { transform: translateY(0); }
          92%, 100% { transform: translateY(46px); }
        }
        @keyframes keyboard05 {
          5%, 12%, 21%, 30%, 39%, 48%, 57%, 66%, 75%, 84% {
            box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key);
          }
          9% { box-shadow: 15px 2px 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          18% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 2px 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          27% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 12px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          36% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 12px 0 var(--key), 60px 12px 0 var(--key), 68px 12px 0 var(--key), 83px 10px 0 var(--key); }
          45% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 2px 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          54% { box-shadow: 15px 0 0 var(--key), 30px 2px 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          63% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 12px 0 var(--key); }
          72% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 2px 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 10px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
          81% { box-shadow: 15px 0 0 var(--key), 30px 0 0 var(--key), 45px 0 0 var(--key), 60px 0 0 var(--key), 75px 0 0 var(--key), 90px 0 0 var(--key), 22px 10px 0 var(--key), 37px 12px 0 var(--key), 52px 10px 0 var(--key), 60px 10px 0 var(--key), 68px 10px 0 var(--key), 83px 10px 0 var(--key); }
        }
      `}</style>
    </div>
  );
}