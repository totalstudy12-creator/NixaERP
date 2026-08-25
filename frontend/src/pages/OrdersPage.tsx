import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiPlus, FiRefreshCw, FiTrash2, FiEdit, FiDownload, FiEye,
  FiShoppingCart, FiClock, FiTruck, FiCheckCircle, FiAlertCircle,
  FiFilter, FiSearch, FiDollarSign, FiUser, FiPackage, FiCalendar,
  FiMapPin, FiPrinter, FiX, FiArrowLeft
} from 'react-icons/fi';

const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);
import OrderPrint from '../components/OrderPrint';

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
type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered';
type OrderSource = 'whatsapp' | 'manual' | 'phone' | 'email';
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'card';
type PaymentDirection = 'inward' | 'outward';
type CustomerType = 'customer' | 'vendor' | 'dealer' | 'distributor';

interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id: number; }
interface Customer { id: number; name: string; type: string; }
interface Product { id: number; name: string; sku: string; price: number; sale_price?: number; }
interface OrderItem { product_id: number; product_name: string; qty: number; price: number; }
interface Order {
  id: number; company_id: number; customer_id: number; customer?: Customer;
  quotation_id: number | null; order_no: string; total_amount: number | string; tax_amount: number | string;
  payment_amount?: number | string; is_partial?: boolean; payment_method?: PaymentMethod;
  payment_direction?: PaymentDirection;   // optional on order
  status: OrderStatus; source: OrderSource; delivery_date: string | null;
  shipping_address: string; notes: string; items: OrderItem[];
  created_at?: string; updated_at?: string; balance_due?: number; payment_status?: string;
  customer_name?: string;
  company?: Company;
}
interface OrderFormData {
  company_id: string | number; customer_id: string | number; quotation_id: string | number;
  order_no: string; total_amount: number | string; tax_amount: number | string;
  status: OrderStatus; source: OrderSource; payment_method: PaymentMethod;
  payment_direction: PaymentDirection;       // added
  payment_amount: number | string; is_partial: boolean; delivery_date: string;
  shipping_address: string; notes: string;
}

interface NewCustomerForm {
  company_id: number | string;
  branch_id: number | string;
  type: CustomerType;
  name: string;
  contact_person: string;
  contact_no: string;
  email: string;
  gst_number: string;
  registration_type: string;
  pan: string;
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_pincode: string;
}

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
  icon: any; label: string; value: number | string; tone: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'teal';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' : tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' : tone === 'amber' ? 'bg-amber-100 text-amber-600' : tone === 'rose' ? 'bg-rose-100 text-rose-600' : tone === 'purple' ? 'bg-purple-100 text-purple-600' : 'bg-teal-100 text-teal-600';
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? value : value}</p>
      </div>
    </div>
  );
});

// ── Main Component ──
export function OrdersPage() {
  // ... (all existing state and logic, with modifications below)

  // Existing state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<OrderFormData>({
    company_id: '', customer_id: '', quotation_id: '', order_no: '',
    total_amount: '', tax_amount: '', status: 'pending', source: 'whatsapp',
    payment_method: 'qr', payment_direction: 'inward',   // added default inward
    payment_amount: 0, is_partial: false,
    delivery_date: '', shipping_address: '', notes: '',
  });
  const [items, setItems] = useState<OrderItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  // ── Customer creation state ──
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({
    company_id: '',
    branch_id: '',
    type: 'customer',
    name: '',
    contact_person: '',
    contact_no: '',
    email: '',
    gst_number: '',
    registration_type: '',
    pan: '',
    billing_street: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Print
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const printTriggered = useRef(false);

  const { showSuccess, showError } = useNotification();

  // ── API Caching ──
  const { data: orders, loading: ordLoading, error: ordError, refresh: refreshOrders } = useApiCache<Order[]>('orders', () => apiClient.getOrders());
  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: customers, refresh: refreshCustomers } = useApiCache<Customer[]>('customers', () => apiClient.getCustomers());
  const { data: products } = useApiCache<Product[]>('products', () => apiClient.getProducts());

  // ── Searchable Select component ──
  const SearchableSelect: React.FC<{
    options: { id: number | string; name: string }[];
    value: string | number | '';
    onChange: (value: string | number | '') => void;
    placeholder?: string;
    disabled?: boolean;
    error?: boolean;
    className?: string;
  }> = ({ options, value, onChange, placeholder, disabled, error, className }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClick = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedOption = options.find(opt => opt.id === value);
    const filtered = useMemo(() => {
      if (!search.trim()) return options;
      return options.filter(opt => opt.name.toLowerCase().includes(search.toLowerCase()));
    }, [options, search]);

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <div
          className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition flex items-center justify-between cursor-pointer ${
            disabled
              ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
              : error
              ? 'border-red-400 ring-2 ring-red-200'
              : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200'
          }`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {selectedOption ? selectedOption.name : <span className="text-gray-400">{placeholder || 'Select...'}</span>}
          <svg className={`h-4 w-4 text-gray-500 transition ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {isOpen && !disabled && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="p-2">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
            <ul className="max-h-40 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500">No options</li>
              ) : filtered.map(opt => (
                <li
                  key={opt.id}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${opt.id === value ? 'bg-blue-100 font-medium' : ''}`}
                  onClick={() => { onChange(opt.id); setIsOpen(false); setSearch(''); }}
                >
                  {opt.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ── Print ──
  const handlePrint = useCallback((order: Order) => {
    setPrintOrder(order);
    printTriggered.current = false;
  }, []);
  useEffect(() => {
    if (printOrder && !printTriggered.current) {
      const timer = setTimeout(() => {
        window.print();
        printTriggered.current = true;
        setPrintOrder(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [printOrder]);

  // ── Order number generator ──
  const generateOrderNo = useCallback(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 9000) + 1000;
    let candidate = `ORD-${y}${m}${d}-${random}`;
    if (orders) {
      let tries = 0;
      while (orders.some(o => o.order_no === candidate) && tries < 100) {
        const newRandom = Math.floor(Math.random() * 9000) + 1000;
        candidate = `ORD-${y}${m}${d}-${newRandom}`;
        tries++;
      }
    }
    return candidate;
  }, [orders]);

  // ── Filter & Search ──
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = [...orders];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(o =>
        o.order_no?.toLowerCase().includes(term) ||
        (o.customer?.name || o.customer_name || '').toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') filtered = filtered.filter(o => o.status === filterStatus);
    if (filterSource !== 'all') filtered = filtered.filter(o => o.source === filterSource);
    return filtered;
  }, [orders, searchTerm, filterStatus, filterSource]);

  const summary = useMemo(() => ({
    total: orders?.length || 0,
    pending: orders?.filter(o => o.status === 'pending').length || 0,
    confirmed: orders?.filter(o => o.status === 'confirmed').length || 0,
    shipped: orders?.filter(o => o.status === 'shipped').length || 0,
    delivered: orders?.filter(o => o.status === 'delivered').length || 0,
    totalDue: orders?.reduce((sum, o) => sum + (o.balance_due || 0), 0) || 0,
  }), [orders]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;
  const totalPages = Math.ceil(filteredOrders.length / rowsPerPage);
  const paginatedOrders = useMemo(() => filteredOrders.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [filteredOrders, currentPage]);
  useEffect(() => setCurrentPage(1), [searchTerm, filterStatus, filterSource]);

  // ── Bulk actions ──
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Delete ${selectedIds.length} order(s)?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.deleteOrder(id)));
      showSuccess('Bulk delete', `${selectedIds.length} order(s) deleted.`);
      setSelectedIds([]); refreshOrders();
    } catch (err: any) { showError('Bulk delete failed', err.message); }
  };
  const handleBulkStatusChange = async (status: OrderStatus) => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Change ${selectedIds.length} order(s) to ${status}?`)) return;
    try {
      await Promise.all(selectedIds.map(id => apiClient.updateOrder(id, { status } as Partial<OrderFormData>)));
      showSuccess('Bulk update', `Status changed for ${selectedIds.length} order(s).`);
      setSelectedIds([]); refreshOrders();
    } catch (err: any) { showError('Bulk update failed', err.message); }
  };

  // ── Map items ──
  const productMap = useMemo(() => {
    if (!products) return new Map<number, string>();
    const map = new Map<number, string>();
    products.forEach(p => map.set(p.id, p.name));
    return map;
  }, [products]);

  const mapOrderItems = useCallback((orderItems: any[]): OrderItem[] => {
    return orderItems.map(item => ({
      product_id: item.product_id,
      product_name: productMap.get(item.product_id) || item.product?.name || item.product_name || `Product #${item.product_id}`,
      qty: item.quantity ?? item.qty ?? 0,
      price: parseFloat(item.unit_price ?? item.price ?? 0),
    }));
  }, [productMap]);

  // ── CRUD ──
  const openView = useCallback((order: Order) => {
    setViewMode(true); setEditingId(order.id);
    setFormData({
      company_id: order.company_id || '', customer_id: order.customer_id || '', quotation_id: order.quotation_id || '',
      order_no: order.order_no || '', total_amount: order.total_amount ?? '', tax_amount: order.tax_amount ?? '',
      status: order.status || 'pending', source: order.source || 'whatsapp', payment_method: order.payment_method || 'qr',
      payment_direction: order.payment_direction || 'inward',   // include direction
      payment_amount: order.payment_amount ?? 0, is_partial: order.is_partial || false,
      delivery_date: order.delivery_date || '', shipping_address: order.shipping_address || '', notes: order.notes || '',
    });
    setItems(mapOrderItems(order.items || []));
    setIsPanelOpen(true);
  }, [mapOrderItems]);

  const openEdit = useCallback((order: Order) => {
    setViewMode(false); setEditingId(order.id);
    setFormData({
      company_id: order.company_id || '', customer_id: order.customer_id || '', quotation_id: order.quotation_id || '',
      order_no: order.order_no || '', total_amount: order.total_amount ?? '', tax_amount: order.tax_amount ?? '',
      status: order.status || 'pending', source: order.source || 'whatsapp', payment_method: order.payment_method || 'qr',
      payment_direction: order.payment_direction || 'inward',   // include direction
      payment_amount: order.payment_amount ?? 0, is_partial: order.is_partial || false,
      delivery_date: order.delivery_date || '', shipping_address: order.shipping_address || '', notes: order.notes || '',
    });
    setItems(mapOrderItems(order.items || []));
    setIsPanelOpen(true);
  }, [mapOrderItems]);

  const handleDelete = useCallback(async (order: Order) => {
    if (!confirm(`Delete order ${order.order_no}?`)) return;
    try {
      await apiClient.deleteOrder(order.id);
      showSuccess('Order deleted', `Order ${order.order_no} removed.`);
      refreshOrders();
    } catch (err: any) { showError('Delete failed', err.message); }
  }, [refreshOrders, showSuccess, showError]);

  // ── Customer creation ──
  const filteredBranchesForNewCustomer = useMemo(() => {
    if (newCustomer.company_id && branches) {
      return branches.filter(b => b.company_id === Number(newCustomer.company_id));
    }
    return [];
  }, [newCustomer.company_id, branches]);

  const createCustomerInline = async () => {
    if (!newCustomer.name.trim()) { showError('Validation', 'Customer name is required.'); return; }
    if (!newCustomer.company_id) { showError('Validation', 'Company is required.'); return; }
    if (!newCustomer.billing_city.trim()) { showError('Validation', 'Billing city is required.'); return; }
    try {
      const created = await apiClient.createCustomer({
        ...newCustomer,
        company_id: Number(newCustomer.company_id),
        branch_id: newCustomer.branch_id ? Number(newCustomer.branch_id) : null,
      });
      showSuccess('Customer created', `${created.name} added.`);
      refreshCustomers();
      setFormData(prev => ({ ...prev, customer_id: created.id }));
      setShowCustomerForm(false);
      setNewCustomer({
        company_id: '', branch_id: '', type: 'customer', name: '', contact_person: '',
        contact_no: '', email: '', gst_number: '', registration_type: '', pan: '',
        billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
      });
    } catch (err: any) { showError('Create failed', err.message); }
  };

  // ── Items management ──
  const [selectedProductId, setSelectedProductId] = useState<string | number | ''>('');
  const addItemToOrder = (productId: number) => {
    if (!products) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (items.some(item => item.product_id === productId)) { showError('Duplicate', 'Product already added.'); return; }
    setItems(prev => [...prev, { product_id: product.id, product_name: product.name, qty: 1, price: product.sale_price || product.price || 0 }]);
  };
  const updateItemQty = (index: number, qty: number) => { if (qty >= 1) setItems(prev => prev.map((it, i) => i === index ? { ...it, qty } : it)); };
  const updateItemPrice = (index: number, price: number) => { if (price >= 0) setItems(prev => prev.map((it, i) => i === index ? { ...it, price } : it)); };
  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.qty * item.price, 0), [items]);
  const tax = useMemo(() => parseFloat(String(formData.tax_amount || 0)) || 0, [formData.tax_amount]);
  const total = subtotal + tax;

  // ── Validation ──
  const validateForm = (): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.company_id || formData.company_id === '') { errors.company_id = true; valid = false; }
    if (!formData.customer_id || formData.customer_id === '') { errors.customer_id = true; valid = false; }
    if (!editingId && !formData.order_no.trim()) { errors.order_no = true; valid = false; }
    if (items.length === 0) { errors.items = true; valid = false; }
    if (total <= 0) { errors.total = true; valid = false; }
    if (formData.is_partial) {
      const pmt = parseFloat(String(formData.payment_amount || 0));
      if (pmt <= 0) { errors.payment_amount = true; valid = false; }
      if (pmt >= total) { errors.payment_amount = true; valid = false; }
    }
    // Validate payment_direction
    if (!['inward', 'outward'].includes(formData.payment_direction)) {
      errors.payment_direction = true;
      valid = false;
    }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  };

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const paymentAmount = parseFloat(String(formData.payment_amount || 0));
    const isPartial = formData.is_partial || (paymentAmount > 0 && paymentAmount < total);
    const payload = {
      company_id: parseInt(String(formData.company_id)),
      customer_id: parseInt(String(formData.customer_id)),
      quotation_id: formData.quotation_id ? parseInt(String(formData.quotation_id)) : null,
      order_no: editingId ? formData.order_no : formData.order_no || undefined,
      total_amount: total,
      tax_amount: tax,
      payment_method: formData.payment_method,
      payment_direction: formData.payment_direction,   // include direction in payload
      payment_amount: paymentAmount,
      is_partial: isPartial,
      status: formData.status,
      source: formData.source,
      delivery_date: formData.delivery_date || null,
      shipping_address: formData.shipping_address,
      notes: formData.notes,
      items: items.map(item => ({ product_id: item.product_id, qty: item.qty, price: item.price })),
    };

    setSubmitting(true);
    try {
      let savedOrder: Order;
      if (editingId) {
        savedOrder = await apiClient.updateOrder(editingId, payload);
        showSuccess('Order updated', `Order ${formData.order_no} updated.`);
      } else {
        savedOrder = await apiClient.createOrder(payload);
        showSuccess('Order created', 'Order created successfully.');
        if (paymentAmount > 0) {
          try {
            await apiClient.createPayment({
              company_id: parseInt(String(formData.company_id)),
              invoice_id: null,
              reference_no: savedOrder.order_no,
              amount: paymentAmount,
              payment_method: formData.payment_method,
              payment_direction: formData.payment_direction,   // pass direction to payment
              status: isPartial ? 'partial' : 'paid',
              transaction_date: new Date().toISOString().slice(0, 10),
              remarks: `Payment for order ${savedOrder.order_no}`,
            });
            showSuccess('Payment recorded', `₹${paymentAmount.toFixed(2)} received.`);
          } catch (payErr: any) {
            showError('Payment record failed', payErr.message);
          }
        }
      }
      addAppLog({ module: 'Orders', action: editingId ? 'Update order' : 'Create order', status: 'success', message: editingId ? `Updated ${formData.order_no}` : 'New order created' });
      setIsPanelOpen(false);
      refreshOrders();
    } catch (err: any) {
      showError('Save failed', err.message);
      addAppLog({ module: 'Orders', action: 'Save order', status: 'error', message: err.message });
    } finally { setSubmitting(false); }
  }, [formData, editingId, items, total, tax, refreshOrders, showSuccess, showError]);

  const handleCreateInvoice = async () => {
    if (!editingId) return;
    const invoiceNo = prompt('Enter invoice number for this order');
    if (!invoiceNo) return;
    try {
      await apiClient.createInvoiceFromOrder(editingId, invoiceNo);
      showSuccess('Invoice created', `Invoice ${invoiceNo} created from order ${formData.order_no}.`);
    } catch (err: any) { showError('Create invoice failed', err.message); }
  };

  const handleExport = useCallback(() => {
    if (filteredOrders.length === 0) { showError('Export failed', 'No orders to export.'); return; }
    const headers = ['Order #', 'Customer', 'Total', 'Source', 'Status', 'Payment Status', 'Delivery Date', 'Date'];
    const rows = filteredOrders.map(o => {
      const total = typeof o.total_amount === 'number' ? o.total_amount : parseFloat(o.total_amount) || 0;
      return [o.order_no, o.customer?.name || o.customer_name || '-', total.toFixed(2), o.source || '-', o.status, o.payment_status || '-', o.delivery_date || '-', o.created_at ? new Date(o.created_at).toLocaleDateString() : '-'];
    });
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    window.URL.revokeObjectURL(url);
    showSuccess('Export', 'Orders exported.');
  }, [filteredOrders, showSuccess, showError]);

  // ── Table Columns ──
  const columns = useMemo(() => [
    { name: 'Order #', selector: (row: Order) => row.order_no, sortable: true, cell: (row: Order) => <span className="font-medium text-slate-800">{row.order_no}</span>, width: '140px' },
    {
      name: 'Customer', selector: (row: Order) => row.customer?.name || row.customer_name || '-',
      cell: (row: Order) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">{(row.customer?.name || row.customer_name || '?')[0]?.toUpperCase()}</div>
          <span className="text-sm">{row.customer?.name || row.customer_name || '-'}</span>
        </div>
      ), sortable: true, width: '180px'
    },
    { name: 'Total', selector: (row: Order) => typeof row.total_amount === 'number' ? row.total_amount : parseFloat(row.total_amount) || 0, sortable: true, cell: (row: Order) => <span className="font-medium">₹{(typeof row.total_amount === 'number' ? row.total_amount : parseFloat(row.total_amount) || 0).toFixed(2)}</span>, width: '120px' },
    { name: 'Source', selector: (row: Order) => row.source, cell: (row: Order) => <span className="px-2.5 py-1 rounded-full text-xs font-medium capitalize bg-slate-100 text-slate-700">{row.source}</span>, sortable: true, width: '110px' },
    {
      name: 'Status / Payment',
      selector: (row: Order) => row.status,
      cell: (row: Order) => {
        const statusMap: Record<string, { label: string; color: string }> = {
          pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
          confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
          shipped: { label: 'Shipped', color: 'bg-purple-100 text-purple-700' },
          delivered: { label: 'Delivered', color: 'bg-emerald-100 text-emerald-700' },
        };
        const status = statusMap[row.status] || statusMap.pending;
        const paid = parseFloat(String(row.payment_amount ?? 0));
        const total = parseFloat(String(row.total_amount ?? 0));
        let paymentStatus = 'pending';
        if (paid <= 0) paymentStatus = 'pending';
        else if (paid >= total) paymentStatus = 'paid';
        else paymentStatus = 'partial';
        const paymentColors: Record<string, string> = {
          pending: 'bg-gray-100 text-gray-700',
          partial: 'bg-amber-100 text-amber-700',
          paid: 'bg-emerald-100 text-emerald-700',
        };
        const paymentLabel = paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partially paid' : 'Pending';
        return (
          <div className="flex flex-col gap-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${paymentColors[paymentStatus]}`}>{paymentLabel}</span>
          </div>
        );
      },
      sortable: true, width: '150px'
    },
    {
      name: 'Delivery',
      selector: (row: Order) => row.delivery_date || '-',
      cell: (row: Order) => <span className="text-sm">{row.delivery_date || '-'}</span>,
      width: '120px',
    },
    {
      name: 'Actions', cell: (row: Order) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openView(row)} className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-50" title="View"><FiEye size={16} /></button>
          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit"><FiEdit size={16} /></button>
          <button onClick={() => handlePrint(row)} className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50" title="Print"><FiPrinter size={16} /></button>
          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Delete"><FiTrash2 size={16} /></button>
        </div>
      ), width: '150px'
    },
  ], [openView, openEdit, handleDelete, handlePrint]);

  // ── Render field helper ──
  const renderField = (label: string, field: keyof OrderFormData, type: 'text' | 'number' | 'date' | 'select' | 'textarea' = 'text', options?: any[], required = false, readOnly = false) => {
    const value = (formData as any)[field] ?? '';
    const id = `field-${field}`;
    const hasError = formErrors[field];
    const disabled = viewMode || readOnly;
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
            disabled={disabled}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
          >
            <option value="">Select {label}</option>
            {options?.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.name || opt.id}</option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            value={value as string}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            disabled={disabled}
            rows={3}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value as string | number}
            onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
            disabled={disabled}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${disabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : hasError ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
            placeholder={`Enter ${label}`}
            step={type === 'number' ? '0.01' : undefined}
          />
        )}
      </div>
    );
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300"><span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /> Order Management</div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3"><FiShoppingCart className="text-cyan-300" /> Orders<span className="text-sm font-normal text-cyan-100/70 ml-2">Sales & Fulfillment</span></h1>
          <p className="text-sm text-slate-300">Create, view, and process customer orders</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshOrders} disabled={ordLoading} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60"><FiRefreshCw className={ordLoading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh</button>
          <button onClick={handleExport} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20"><FiDownload className="inline mr-1" size={14} /> Export</button>
          <button onClick={() => {
            setViewMode(false); setEditingId(null);
            setFormData({
              company_id: '', customer_id: '', quotation_id: '', order_no: generateOrderNo(),
              total_amount: '', tax_amount: '', status: 'pending', source: 'whatsapp',
              payment_method: 'qr', payment_direction: 'inward',   // reset with default inward
              payment_amount: 0, is_partial: false,
              delivery_date: '', shipping_address: '', notes: '',
            });
            setItems([]); setFormErrors({}); setIsPanelOpen(true); setShowCustomerForm(false); setSelectedProductId('');
          }} className="rounded-xl bg-cyan-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-cyan-300 shadow-md shadow-cyan-500/20"><FiPlus className="inline mr-1" size={14} /> New Order</button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md"><FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} /><input type="text" placeholder="Search by order # or customer name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 transition" /></div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm"><option value="all">All Status</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="shipped">Shipped</option><option value="delivered">Delivered</option></select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="rounded-xl border-slate-200 bg-white py-2 px-3 text-sm"><option value="all">All Sources</option><option value="whatsapp">WhatsApp</option><option value="manual">Manual</option><option value="phone">Phone</option><option value="email">Email</option></select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        {orders ? (
          <>
            <StatCard icon={FiShoppingCart} label="Total" value={summary.total} tone="blue" />
            <StatCard icon={FiClock} label="Pending" value={summary.pending} tone="amber" />
            <StatCard icon={FiCheckCircle} label="Confirmed" value={summary.confirmed} tone="emerald" />
            <StatCard icon={FiTruck} label="Shipped" value={summary.shipped} tone="purple" />
            <StatCard icon={FiPackage} label="Delivered" value={summary.delivered} tone="teal" />
            <StatCard icon={FiDollarSign} label="Total Due" value={`₹${summary.totalDue.toFixed(2)}`} tone="rose" />
          </>
        ) : [...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)}
      </div>

      {ordError && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake"><FiAlertCircle size={20} /> {ordError}</div>}

      {selectedIds.length > 0 && (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-700">{selectedIds.length} selected</span>
          <button onClick={() => handleBulkStatusChange('confirmed')} className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600"><FiEdit size={16} /> Confirm</button>
          <button onClick={() => handleBulkStatusChange('shipped')} className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-600"><FiEdit size={16} /> Ship</button>
          <button onClick={() => handleBulkStatusChange('delivered')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600"><FiEdit size={16} /> Deliver</button>
          <button onClick={handleBulkDelete} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-600"><FiTrash2 size={16} /> Delete</button>
          <button onClick={() => setSelectedIds([])} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {ordLoading ? <TableSkeleton /> : (
            <>
              <ModernDataTable title="Orders" columns={columns} data={paginatedOrders} loading={false} selectable selectedIds={selectedIds} onSelectionChange={setSelectedIds} striped highlightOnHover pointerOnHover />
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredOrders.length)} of {filteredOrders.length}</span>
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

      {/* Offcanvas – Order or Customer form */}
      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading form...</div></div>}>
          <Offcanvas
            isOpen={isPanelOpen}
            title={showCustomerForm ? 'Create Customer' : (viewMode ? 'View Order' : editingId ? 'Edit Order' : 'Create Order')}
            onClose={() => { if (showCustomerForm) setShowCustomerForm(false); else setIsPanelOpen(false); }}
            footer={
              showCustomerForm ? (
                <div className="flex justify-between w-full">
                  <button onClick={() => { setShowCustomerForm(false); setNewCustomer({ company_id: '', branch_id: '', type: 'customer', name: '', contact_person: '', contact_no: '', email: '', gst_number: '', registration_type: '', pan: '', billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '' }); }} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">
                    <FiArrowLeft className="inline mr-1" /> Back to Order
                  </button>
                  <button onClick={createCustomerInline} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                    Create Customer
                  </button>
                </div>
              ) : (
                <div className="flex justify-between w-full">
                  <button onClick={() => setIsPanelOpen(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={submitting}>
                    <FiX className="inline mr-1" /> {viewMode ? 'Close' : 'Cancel'}
                  </button>
                  {!viewMode && (
                    <div className="flex gap-2">
                      {editingId && (
                        <button onClick={handleCreateInvoice} className="px-4 py-2 rounded-lg border text-blue-600 hover:bg-blue-50">Create Invoice</button>
                      )}
                      <button onClick={handleSubmit} disabled={submitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
                        {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              )
            }
          >
            {showCustomerForm ? (
              /* Full sidebar – Customer creation form */
              <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Customer Information</legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                      <SearchableSelect
                        options={companies?.map(c => ({ id: c.id, name: c.name })) || []}
                        value={newCustomer.company_id}
                        onChange={(val) => setNewCustomer(prev => ({ ...prev, company_id: val }))}
                        placeholder="Select Company"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                      <SearchableSelect
                        options={filteredBranchesForNewCustomer.map(b => ({ id: b.id, name: b.name }))}
                        value={newCustomer.branch_id}
                        onChange={(val) => setNewCustomer(prev => ({ ...prev, branch_id: val }))}
                        placeholder="None"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                      <select value={newCustomer.type} onChange={e => setNewCustomer(prev => ({ ...prev, type: e.target.value as CustomerType }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                        <option value="customer">Customer</option>
                        <option value="vendor">Vendor</option>
                        <option value="dealer">Dealer</option>
                        <option value="distributor">Distributor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input type="text" value={newCustomer.name} onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Customer name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                      <input type="text" value={newCustomer.contact_person} onChange={e => setNewCustomer(prev => ({ ...prev, contact_person: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Contact person" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact No</label>
                      <input type="text" value={newCustomer.contact_no} onChange={e => setNewCustomer(prev => ({ ...prev, contact_no: e.target.value.replace(/\D/g, '') }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Phone Number" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input type="email" value={newCustomer.email} onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Email" />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Registration & Tax</legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                      <input type="text" value={newCustomer.gst_number} onChange={e => setNewCustomer(prev => ({ ...prev, gst_number: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="GSTIN" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Registration Type</label>
                      <select value={newCustomer.registration_type} onChange={e => setNewCustomer(prev => ({ ...prev, registration_type: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
                        <option value="">Select</option>
                        <option value="Registered">Registered</option>
                        <option value="Unregistered">Unregistered</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                      <input type="text" value={newCustomer.pan} onChange={e => setNewCustomer(prev => ({ ...prev, pan: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="PAN" />
                    </div>
                  </div>
                </fieldset>

                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Billing Address</legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <input type="text" value={newCustomer.billing_city} onChange={e => setNewCustomer(prev => ({ ...prev, billing_city: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="City" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input type="text" value={newCustomer.billing_state} onChange={e => setNewCustomer(prev => ({ ...prev, billing_state: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="State" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                      <input type="text" value={newCustomer.billing_country} onChange={e => setNewCustomer(prev => ({ ...prev, billing_country: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Country" defaultValue="India" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
                      <input type="text" value={newCustomer.billing_pincode} onChange={e => setNewCustomer(prev => ({ ...prev, billing_pincode: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Pincode" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                      <textarea value={newCustomer.billing_street} onChange={e => setNewCustomer(prev => ({ ...prev, billing_street: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" placeholder="Street address" />
                    </div>
                  </div>
                </fieldset>
              </div>
            ) : (
              /* Order form */
              <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Order Information
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {renderField('Company *', 'company_id', 'select', companies?.map(c => ({ id: c.id, name: c.name })), true)}

                    {/* Searchable Customer Select */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            options={customers?.map(c => ({ id: c.id, name: c.name })) || []}
                            value={formData.customer_id}
                            onChange={(val) => setFormData(prev => ({ ...prev, customer_id: val }))}
                            placeholder="Select Customer"
                            disabled={viewMode}
                            error={formErrors.customer_id}
                          />
                        </div>
                        {!viewMode && (
                          <button type="button" onClick={() => setShowCustomerForm(true)} className="px-3 py-2 rounded-lg border text-sm text-blue-600 hover:bg-blue-50">
                            Add
                          </button>
                        )}
                      </div>
                    </div>

                    {renderField('Order Number', 'order_no', 'text', undefined, false, viewMode)}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quotation</label>
                      <input type="text" disabled value="Coming soon" className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm cursor-not-allowed" />
                    </div>
                  </div>
                </fieldset>

                {/* Items */}
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Items
                  </legend>
                  <div className="mt-3">
                    {!viewMode ? (
                      <>
                        <div className="flex gap-2 mb-3">
                          <SearchableSelect
                            options={products?.map(p => ({ id: p.id, name: `${p.name} (₹${p.sale_price || p.price || 0})` })) || []}
                            value={selectedProductId}
                            onChange={(val) => {
                              if (val) {
                                addItemToOrder(Number(val));
                                setSelectedProductId('');
                              }
                            }}
                            placeholder="Select product to add"
                            disabled={false}
                          />
                        </div>
                        {items.length === 0 ? <p className="text-sm text-slate-500 italic">No products added yet.</p> : (
                          <div className="space-y-2 border rounded p-2 bg-white max-h-60 overflow-y-auto">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 p-1 border-b last:border-0">
                                <span className="flex-1 text-sm font-medium">{item.product_name}</span>
                                <input type="number" min="1" value={item.qty} onChange={e => updateItemQty(idx, Number(e.target.value))} className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                                <input type="number" step="0.01" min="0" value={item.price} onChange={e => updateItemPrice(idx, Number(e.target.value))} className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                                <button className="text-rose-500 hover:text-rose-700 p-1" onClick={() => removeItem(idx)}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-gray-50 p-2 rounded border max-h-60 overflow-y-auto">
                        {items.length === 0 ? <p className="text-sm text-slate-500 italic">No items</p> : (
                          <ul className="space-y-1">
                            {items.map((item, idx) => (
                              <li key={idx} className="flex justify-between text-sm"><span>{item.product_name}</span><span>{item.qty} × ₹{(item.price ?? 0).toFixed(2)} = ₹{((item.qty ?? 0) * (item.price ?? 0)).toFixed(2)}</span></li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal</label>
                        <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm">₹{subtotal.toFixed(2)}</div>
                      </div>
                      <div>
                        {renderField('Tax Amount', 'tax_amount', 'number')}
                        <p className="text-xs text-gray-400 mt-1">Leave empty for 0 tax</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
                        <div className="w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold">₹{total.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                </fieldset>

                {/* Payment */}
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Payment
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {renderField('Payment Method', 'payment_method', 'select', [
                      { id: 'qr', name: 'UPI' },
                      { id: 'bank_transfer', name: 'Bank Transfer' },
                      { id: 'cash', name: 'Cash' },
                      { id: 'card', name: 'Card' }
                    ])}
                    {/* Payment Direction */}
                    <div>
                      <label htmlFor="field-payment_direction" className="block text-sm font-medium text-gray-700 mb-1">
                        Payment Direction <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="field-payment_direction"
                        value={formData.payment_direction}
                        onChange={(e) => setFormData(prev => ({ ...prev, payment_direction: e.target.value as PaymentDirection }))}
                        disabled={viewMode}
                        className={`w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition ${viewMode ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : formErrors.payment_direction ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200'}`}
                      >
                        <option value="inward">Inward (Payment Received)</option>
                        <option value="outward">Outward (Payment Sent)</option>
                      </select>
                    </div>
                    {renderField('Order Source', 'source', 'select', [
                      { id: 'whatsapp', name: 'WhatsApp' },
                      { id: 'manual', name: 'Manual' },
                      { id: 'phone', name: 'Phone' },
                      { id: 'email', name: 'Email' }
                    ])}
                    <div className="col-span-2">
                      {renderField('Amount Paid', 'payment_amount', 'number')}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="is_partial"
                          checked={formData.is_partial}
                          onChange={(e) => setFormData(prev => ({ ...prev, is_partial: e.target.checked }))}
                          disabled={viewMode}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="is_partial" className="text-sm text-gray-700">Partial Payment</label>
                      </div>
                      {formData.is_partial && (
                        <p className="text-xs text-amber-600 mt-1">Amount must be greater than 0 and less than the total.</p>
                      )}
                    </div>
                    <div className="col-span-2 mt-3 p-3 bg-gray-50 rounded border">
                      <div className="flex justify-between text-sm"><span>Total Paid</span><span className="font-semibold">₹{parseFloat(String(formData.payment_amount || 0)).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span>Balance Due</span><span className="font-semibold text-rose-600">₹{(total - parseFloat(String(formData.payment_amount || 0))).toFixed(2)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span>Payment Status</span><span className={`font-semibold ${(total - parseFloat(String(formData.payment_amount || 0))) <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>{(total - parseFloat(String(formData.payment_amount || 0))) <= 0 ? 'Paid' : 'Partial'}</span></div>
                    </div>
                  </div>
                </fieldset>

                {/* Delivery & Status */}
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Delivery & Status
                  </legend>
                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {renderField('Delivery Date', 'delivery_date', 'date')}
                    {renderField('Status', 'status', 'select', [
                      { id: 'pending', name: 'Pending' },
                      { id: 'confirmed', name: 'Confirmed' },
                      { id: 'shipped', name: 'Shipped' },
                      { id: 'delivered', name: 'Delivered' }
                    ])}
                    <div className="col-span-2">{renderField('Shipping Address', 'shipping_address', 'textarea')}</div>
                  </div>
                </fieldset>

                {/* Notes */}
                <fieldset className="border rounded-lg p-4">
                  <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> Notes
                  </legend>
                  <div className="mt-3">
                    {renderField('Notes', 'notes', 'textarea')}
                  </div>
                </fieldset>
              </div>
            )}
          </Offcanvas>
        </Suspense>
      )}

      {/* Hidden print section */}
      {printOrder && <OrderPrint order={printOrder} onReady={() => {}} />}

      <style>{`
        .stat-card { animation: attendance-fade-up 0.38s ease-out both; }
        .stat-card:nth-child(2) { animation-delay: 0.05s; } .stat-card:nth-child(3) { animation-delay: 0.1s; } .stat-card:nth-child(4) { animation-delay: 0.15s; } .stat-card:nth-child(5) { animation-delay: 0.2s; }
        @keyframes attendance-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; } @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-shake { animation: shake 0.4s ease-in-out; } @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) { .rdt_TableCol, .rdt_TableCell { white-space: nowrap; } }
        .rdt_TableHeader .search-container, .rdt_TableHeader input[type="text"] { display: none !important; }
        .rdt_TableHeader > div:last-child { display: none !important; }
        .rdt_TableCol:first-child, .rdt_TableCell:first-child { display: none !important; }
      `}</style>
    </div>
  );
}