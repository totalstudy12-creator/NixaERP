// src/pages/CreatePurchaseInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiSearch, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiPrinter, FiRefreshCw, FiLoader, FiChevronDown, FiChevronUp,
  FiCheckCircle, FiAlertCircle, FiChevronRight
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const Offcanvas = lazy(() => import('../components/Offcanvas').then(m => ({ default: m.Offcanvas })));

// ── Types ──────────────────────────────────────────
interface Company { id: number; name: string; }
interface Supplier {
  id: number; name: string; code?: string;
  contact_person?: string; contact_no?: string; email?: string;
  phone?: string; gst_number?: string; pan?: string;
  billing_street?: string; billing_city?: string; billing_state?: string;
  billing_country?: string; billing_pincode?: string;
  company_id?: number;
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string;
  purchase_price?: number | string; sale_price?: number | string;
  tax_rate?: number | string; igst_rate?: number | string;
  stock_quantity?: number | string; unit?: string; sku?: string; barcode?: string;
}
interface BankAccount { id: number; bank_name: string; account_no: string; }

interface PurchaseItem {
  product_id: number; product_name: string; hsn_sac_code: string;
  qty: number; uom: string; price: number;
  discount_type: 'percent' | 'amount'; discount_percent: number; discount_amount: number;
  gst_slab: number; is_inter_state: boolean;
  cgst_percent: number; sgst_percent: number; igst_percent: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number; total: number;
}

interface AdditionalCharge { id: string; label: string; amount: number; }

interface PaymentEntry {
  id: string;
  amount: number;
  payment_method: 'UPI' | 'cash' | 'cheque' | 'bank_transfer' | 'other';
  reference_no: string;
  transaction_date: string;
  bank_name: string;
  account_number: string;
  remarks: string;
  payment_direction: 'inward' | 'outward';
}

interface PurchaseFormData {
  company_id: number | ''; supplier_id: number | '';
  supplier_name: string; supplier_address: string;
  contact_person: string; phone_no: string; gstin_pan: string;
  reverse_charge: boolean; ship_to: string; place_of_supply: string;
  invoice_type: 'purchase_invoice' | 'purchase_bill';
  invoice_no: string; invoice_date: string;
  challan_no: string; challan_date: string;
  po_no: string; po_date: string; lr_no: string; eway_no: string;
  delivery_mode: string;
  payment_type: 'credit' | 'cash' | 'cheque' | 'online' | 'bank_transfer';
  payment_term: string; due_date: string;
  bank_id: number | '';
  packing_charges: number; general_discount_percent: number; general_discount_amount: number;
  tcs_percent: number; round_off: number;
  terms_title: string; terms_detail: string; document_note: string;
  additional_charges: AdditionalCharge[]; internal_note: string;
  billing_street: string; billing_city: string; billing_state: string; billing_country: string; billing_pincode: string;
  shipping_street: string; shipping_city: string; shipping_state: string; shipping_country: string; shipping_pincode: string;
  territory: string; zone: string; status: string; credit_limit: number; outstanding_amount: number;
  wallet_balance: number; commission_rate: number; kyc_status: string; opening_balance: number;
  due_days: number; fax: string; website: string; license_no: string;
  custom_field_1: string; custom_field_2: string; notes: string; email: string;
  payments: PaymentEntry[];
}

// ── Number to words ───────────────────────────────
function numberToWordsINR(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (n: number): string => {
    if (n === 0) return '';
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    let words = '';
    if (hundred > 0) words += units[hundred] + ' Hundred ';
    if (remainder === 0) return words.trim();
    if (remainder < 10) words += units[remainder];
    else if (remainder < 20) words += teens[remainder - 10];
    else {
      const ten = Math.floor(remainder / 10);
      words += tens[ten];
      if (remainder % 10) words += ' ' + units[remainder % 10];
    }
    return words.trim();
  };
  if (amount === 0) return 'Zero Rupees Only';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = '';
  let n = rupees;
  const parts: number[] = [];
  while (n > 0) { parts.push(n % 1000); n = Math.floor(n / 1000); }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] > 0) {
      let prefix = convert(parts[i]);
      if (i === 1) prefix += ' Thousand';
      else if (i === 2) prefix += ' Lakh';
      else if (i === 3) prefix += ' Crore';
      words = prefix + ' ' + words;
    }
  }
  words = words.trim() + ' Rupees';
  if (paise > 0) words += ' and ' + convert(paise) + ' Paise';
  return words + ' Only';
}

// ── Stable API Cache Hook ─────────────────────────
const cache = new Map<string, { data: any; timestamp: number }>();
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data); setLoading(false); return;
      }
    }
    setLoading(true); setError(null);
    try {
      const res = await fetcher();
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      console.error('API error:', err);
      setError('Unable to load data. Please try again.');
    } finally { setLoading(false); }
  }, [key, fetcher, ttlMs]);
  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ── Helper: safe currency formatter ──
function formatCurrency(value: number | string | undefined | null): string {
  const num = Number(value);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

// ── Helper: friendly error ──
function getUserFriendlyError(error: any, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error.validationErrors) {
    const messages = Object.values(error.validationErrors).flat();
    return messages.join(', ') || fallback;
  }
  if (error.message && typeof error.message === 'string') {
    if (error.message.includes('TypeError') || error.message.includes('Cannot read')) {
      return fallback;
    }
    return error.message;
  }
  return fallback;
}

// ── Main Component ────────────────────────────────
export function CreatePurchaseInvoicePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const getCompanies = useCallback(() => apiClient.getCompanies(), []);
  const getSuppliers = useCallback(() => apiClient.getSuppliers(), []);
  const getProducts = useCallback(() => apiClient.getAllProducts(), []);
  const getBanks = useCallback(async () => {
    try { return await apiClient.request('GET', '/banks'); } catch { return []; }
  }, []);

  const { data: companies, loading: companiesLoading, error: companiesError } = useApiCache<Company[]>('companies', getCompanies);
  const { data: suppliers, loading: suppliersLoading, error: suppliersError, refresh: refreshSuppliers } = useApiCache<Supplier[]>('suppliers', getSuppliers);
  const { data: products, loading: productsLoading, error: productsError, refresh: refreshProducts } = useApiCache<Product[]>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount[]>('banks', getBanks);

  const generateInvoicePlaceholder = () => {
    const y = new Date().getFullYear();
    return `PUR-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [autoRoundOff, setAutoRoundOff] = useState(true);

  const [form, setForm] = useState<PurchaseFormData>({
    company_id: '',
    supplier_id: '',
    supplier_name: '',
    supplier_address: '',
    contact_person: '',
    phone_no: '',
    gstin_pan: '',
    reverse_charge: false,
    ship_to: '',
    place_of_supply: '',
    invoice_type: 'purchase_invoice',
    invoice_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    challan_no: '',
    challan_date: '',
    po_no: '',
    po_date: '',
    lr_no: '',
    eway_no: '',
    delivery_mode: '',
    payment_type: 'credit',
    payment_term: '',
    due_date: '',
    bank_id: '',
    packing_charges: 0,
    general_discount_percent: 0,
    general_discount_amount: 0,
    tcs_percent: 0,
    round_off: 0,
    terms_title: 'Terms and Conditions',
    terms_detail: '',
    document_note: '',
    additional_charges: [],
    internal_note: '',
    billing_street: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
    shipping_street: '',
    shipping_city: '',
    shipping_state: '',
    shipping_country: 'India',
    shipping_pincode: '',
    territory: '',
    zone: '',
    status: 'active',
    credit_limit: 0,
    outstanding_amount: 0,
    wallet_balance: 0,
    commission_rate: 0,
    kyc_status: 'pending',
    opening_balance: 0,
    due_days: 0,
    fax: '',
    website: '',
    license_no: '',
    custom_field_1: '',
    custom_field_2: '',
    notes: '',
    email: '',
    payments: [],
  });

  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Supplier creation offcanvas state
  const [showSupplierOffcanvas, setShowSupplierOffcanvas] = useState(false);
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);
  const [newSupplier, setNewSupplier] = useState({
    company_id: '',
    name: '',
    contact_person: '',
    contact_no: '',
    email: '',
    phone: '',
    gst_number: '',
    pan: '',
    billing_street: '',
    billing_city: '',
    billing_state: '',
    billing_country: 'India',
    billing_pincode: '',
    shipping_street: '',
    shipping_city: '',
    shipping_state: '',
    shipping_country: 'India',
    shipping_pincode: '',
    same_as_billing: true,
    opening_balance: 0,
    credit_limit: 0,
    due_days: 0,
    notes: '',
  });

  // Product creation offcanvas state
  const [showProductOffcanvas, setShowProductOffcanvas] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [newProduct, setNewProduct] = useState({
    company_id: '',
    branch_id: '',
    name: '',
    sku: '',
    hsn_sac_code: '',
    unit: 'Piece',
    sale_price: '',
    purchase_price: '',
    tax_rate: '0',
    stock_quantity: '0',
    reorder_level: '0',
    description: '',
  });
  const [productFormErrors, setProductFormErrors] = useState<Record<string, boolean>>({});

  // Dirty state
  const [isDirty, setIsDirty] = useState(false);
  const initialForm = useRef(JSON.stringify(form));
  const initialItems = useRef(JSON.stringify(items));

  useEffect(() => {
    const currentForm = JSON.stringify(form);
    const currentItems = JSON.stringify(items);
    setIsDirty(currentForm !== initialForm.current || currentItems !== initialItems.current);
  }, [form, items]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // ── Filtered lists ──
  const filteredSuppliers = useMemo(() => {
    if (!suppliers || !Array.isArray(suppliers)) return [];
    let list = suppliers;
    if (form.company_id) {
      list = list.filter(s => !s.company_id || s.company_id === Number(form.company_id));
    }
    const term = supplierSearch.toLowerCase().trim();
    if (!term) return list;
    return list.filter(s =>
      s.name?.toLowerCase().includes(term) ||
      (s.code && s.code.toLowerCase().includes(term)) ||
      (s.gst_number && s.gst_number.toLowerCase().includes(term))
    );
  }, [suppliers, supplierSearch, form.company_id]);

  const filteredProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    const term = productSearch.toLowerCase().trim();
    if (!term) return products;
    return products.filter(p =>
      p.name?.toLowerCase().includes(term) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.barcode && p.barcode.toLowerCase().includes(term)) ||
      (p.hsn_sac_code && p.hsn_sac_code.toLowerCase().includes(term))
    );
  }, [products, productSearch]);

  // Auto-fill supplier details
  useEffect(() => {
    if (form.supplier_id && suppliers) {
      const sup = suppliers.find(s => s.id === Number(form.supplier_id));
      if (sup) {
        setForm(prev => ({
          ...prev,
          supplier_name: sup.name || '',
          supplier_address: sup.billing_street || '',
          contact_person: sup.contact_person || '',
          phone_no: sup.phone || sup.contact_no || '',
          gstin_pan: sup.gst_number || sup.pan || '',
          place_of_supply: sup.billing_state || '',
          email: sup.email || '',
        }));
        setSupplierSearch(sup.name);
      }
    }
  }, [form.supplier_id, suppliers]);

  // ── Open product offcanvas ──
  const openProductOffcanvas = () => {
    setNewProduct(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
    }));
    setProductFormErrors({});
    setShowProductOffcanvas(true);
  };

  // ── Supplier creation handler ──
  const createSupplier = async () => {
    if (!newSupplier.name.trim()) { showError('Validation', 'Supplier name is required.'); return; }
    if (!newSupplier.company_id) { showError('Validation', 'Company is required.'); return; }
    try {
      setSupplierSubmitting(true);
      const payload = {
        ...newSupplier,
        company_id: Number(newSupplier.company_id),
        type: 'supplier',
        is_active: true,
      };
      const created = await apiClient.createSupplier(payload);
      showSuccess('Supplier created', `${created.name} added.`);
      refreshSuppliers();
      setForm(prev => ({ ...prev, supplier_id: created.id }));
      setShowSupplierOffcanvas(false);
      setNewSupplier({
        company_id: '',
        name: '',
        contact_person: '',
        contact_no: '',
        email: '',
        phone: '',
        gst_number: '',
        pan: '',
        billing_street: '',
        billing_city: '',
        billing_state: '',
        billing_country: 'India',
        billing_pincode: '',
        shipping_street: '',
        shipping_city: '',
        shipping_state: '',
        shipping_country: 'India',
        shipping_pincode: '',
        same_as_billing: true,
        opening_balance: 0,
        credit_limit: 0,
        due_days: 0,
        notes: '',
      });
    } catch (err: any) {
      const errorMsg = getUserFriendlyError(err, 'Supplier creation failed.');
      showError('Create failed', errorMsg);
    } finally {
      setSupplierSubmitting(false);
    }
  };

  // ── Product creation handler ──
  const createProduct = async () => {
    const errors: Record<string, boolean> = {};
    if (!newProduct.company_id) errors.company_id = true;
    if (!newProduct.name.trim()) errors.name = true;
    if (!newProduct.purchase_price || parseFloat(newProduct.purchase_price) < 0) errors.purchase_price = true;
    if (!newProduct.unit.trim()) errors.unit = true;
    setProductFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Validation', 'Please fill in required fields (Company, Name, Purchase Price, Unit).');
      return;
    }

    let sku = newProduct.sku.trim();
    if (!sku) {
      const prefix = 'FU-';
      let maxNum = 0;
      products?.forEach(p => {
        if (p.sku && p.sku.startsWith(prefix)) {
          const num = parseInt(p.sku.slice(prefix.length), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      sku = `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
    }

    const payload = {
      company_id: Number(newProduct.company_id),
      branch_id: newProduct.branch_id ? Number(newProduct.branch_id) : null,
      name: newProduct.name.trim(),
      sku,
      hsn_sac_code: newProduct.hsn_sac_code.trim(),
      unit: newProduct.unit.trim(),
      sale_price: parseFloat(newProduct.sale_price || '0'),
      purchase_price: parseFloat(newProduct.purchase_price || '0'),
      tax_rate: parseFloat(newProduct.tax_rate || '0'),
      stock_quantity: parseInt(newProduct.stock_quantity || '0'),
      reorder_level: parseInt(newProduct.reorder_level || '0'),
      description: newProduct.description.trim(),
      active: true,
    };

    setProductSubmitting(true);
    try {
      const created = await apiClient.createProduct(payload);
      showSuccess('Product created', `${created.name} added to catalog.`);
      refreshProducts();
      setShowProductOffcanvas(false);
      setNewProduct({
        company_id: '',
        branch_id: '',
        name: '',
        sku: '',
        hsn_sac_code: '',
        unit: 'Piece',
        sale_price: '',
        purchase_price: '',
        tax_rate: '0',
        stock_quantity: '0',
        reorder_level: '0',
        description: '',
      });
      if (created?.id && created?.name && created?.purchase_price !== undefined) {
        const productToAdd: Product = {
          id: created.id,
          name: created.name,
          hsn_sac_code: created.hsn_sac_code || '',
          uom: created.unit || 'NOS',
          purchase_price: created.purchase_price,
          tax_rate: created.tax_rate,
          igst_rate: created.tax_rate,
          stock_quantity: created.stock_quantity,
          unit: created.unit,
          sku: created.sku,
        };
        addItem(productToAdd);
      }
    } catch (err: any) {
      const errorMsg = getUserFriendlyError(err, 'Product creation failed.');
      showError('Product creation failed', errorMsg);
      addAppLog({ module: 'Inventory', action: 'Create', status: 'error', message: errorMsg });
    } finally {
      setProductSubmitting(false);
    }
  };

  // ── Item Management ──
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) {
      showError('Duplicate', 'Product already in list.');
      return;
    }
    const price = Number(product.purchase_price || 0);
    const newItem: PurchaseItem = {
      product_id: product.id,
      product_name: product.name,
      hsn_sac_code: product.hsn_sac_code || '',
      qty: 1,
      uom: product.uom || product.unit || 'NOS',
      price: price,
      discount_type: 'percent',
      discount_percent: 0,
      discount_amount: 0,
      gst_slab: Number(product.tax_rate || product.igst_rate || 0),
      is_inter_state: true,
      cgst_percent: 0,
      sgst_percent: 0,
      igst_percent: Number(product.igst_rate || product.tax_rate || 0),
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total: 0,
    };
    // calculate totals for initial state
    const base = newItem.qty * newItem.price;
    let cgst = 0, sgst = 0, igst = 0;
    if (newItem.is_inter_state) {
      igst = base * (newItem.gst_slab / 100);
    } else {
      const half = newItem.gst_slab / 2;
      cgst = base * (half / 100);
      sgst = base * (half / 100);
    }
    newItem.cgst_amount = cgst;
    newItem.sgst_amount = sgst;
    newItem.igst_amount = igst;
    newItem.total = base + cgst + sgst + igst;
    setItems(prev => [...prev, newItem]);
    setProductSearch('');
    setShowProductDropdown(false);
  }, [items, showError]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: keyof PurchaseItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const recalcItem = useCallback((index: number) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      const base = item.qty * item.price;
      const discount = item.discount_type === 'percent'
        ? base * (item.discount_percent / 100)
        : item.discount_amount;
      const afterDiscount = Math.max(0, base - discount);
      const slab = item.gst_slab || 0;
      if (item.is_inter_state) {
        item.igst_percent = slab;
        item.cgst_percent = 0; item.sgst_percent = 0;
        item.igst_amount = afterDiscount * (slab / 100);
        item.cgst_amount = 0; item.sgst_amount = 0;
      } else {
        const half = slab / 2;
        item.cgst_percent = half; item.sgst_percent = half; item.igst_percent = 0;
        item.cgst_amount = afterDiscount * (half / 100);
        item.sgst_amount = afterDiscount * (half / 100);
        item.igst_amount = 0;
      }
      item.discount_amount = discount;
      item.total = afterDiscount + item.cgst_amount + item.sgst_amount + item.igst_amount;
      updated[index] = item;
      return updated;
    });
  }, []);

  // ── Additional Charges ──
  const addAdditionalCharge = () => setForm(prev => ({
    ...prev,
    additional_charges: [...prev.additional_charges, { id: Date.now().toString(), label: '', amount: 0 }]
  }));
  const updateAdditionalCharge = (id: string, field: 'label' | 'amount', value: any) => setForm(prev => ({
    ...prev,
    additional_charges: prev.additional_charges.map(c => c.id === id ? { ...c, [field]: value } : c)
  }));
  const removeAdditionalCharge = (id: string) => setForm(prev => ({
    ...prev,
    additional_charges: prev.additional_charges.filter(c => c.id !== id)
  }));

  // ── Payment Management ──
  const addPayment = () => {
    const newPayment: PaymentEntry = {
      id: `new_${Date.now()}`,
      amount: 0,
      payment_method: 'bank_transfer',
      reference_no: '',
      transaction_date: new Date().toISOString().split('T')[0],
      bank_name: '',
      account_number: '',
      remarks: '',
      payment_direction: 'outward',
    };
    setForm(prev => ({ ...prev, payments: [...prev.payments, newPayment] }));
  };

  const updatePayment = (id: string, field: keyof PaymentEntry, value: any) => {
    setForm(prev => ({
      ...prev,
      payments: prev.payments.map(p => p.id === id ? { ...p, [field]: value } : p)
    }));
  };

  const removePayment = (id: string) => {
    setForm(prev => ({
      ...prev,
      payments: prev.payments.filter(p => p.id !== id)
    }));
  };

  // ── Totals ──
  const itemSubtotal = useMemo(() => items.reduce((s, i) => s + (i.qty * i.price), 0), [items]);
  const itemDiscountTotal = useMemo(() => items.reduce((s, i) => s + (i.discount_amount || 0), 0), [items]);
  const itemCgstTotal = useMemo(() => items.reduce((s, i) => s + (i.cgst_amount || 0), 0), [items]);
  const itemSgstTotal = useMemo(() => items.reduce((s, i) => s + (i.sgst_amount || 0), 0), [items]);
  const itemIgstTotal = useMemo(() => items.reduce((s, i) => s + (i.igst_amount || 0), 0), [items]);
  const totalTax = itemCgstTotal + itemSgstTotal + itemIgstTotal;
  const itemTaxableTotal = useMemo(() => itemSubtotal - itemDiscountTotal, [itemSubtotal, itemDiscountTotal]);

  const generalDiscountAmount = useMemo(() =>
    form.general_discount_percent
      ? (itemTaxableTotal * form.general_discount_percent) / 100
      : form.general_discount_amount,
  [itemTaxableTotal, form.general_discount_percent, form.general_discount_amount]);

  const additionalChargesTotal = useMemo(() => form.additional_charges.reduce((s, c) => s + (c.amount || 0), 0), [form.additional_charges]);

  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + form.packing_charges;
  const tcsAmount = useMemo(() => totalBeforeTcs * (form.tcs_percent / 100), [totalBeforeTcs, form.tcs_percent]);
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;

  useEffect(() => {
    if (autoRoundOff) {
      const rounded = Math.round(totalBeforeRoundOff);
      const roundOffValue = +(rounded - totalBeforeRoundOff).toFixed(2);
      setForm(prev => ({ ...prev, round_off: roundOffValue }));
    }
  }, [autoRoundOff, totalBeforeRoundOff]);

  const grandTotal = totalBeforeRoundOff + form.round_off;
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);

  // Derived payment totals
  const totalPaid = useMemo(() => form.payments.reduce((s, p) => s + (p.amount || 0), 0), [form.payments]);
  const balanceDue = grandTotal - totalPaid;

  const handleSupplierSelect = (supplier: Supplier) => {
    setForm(prev => ({ ...prev, supplier_id: supplier.id }));
    setSupplierSearch('');
    setShowSupplierDropdown(false);
  };

  // Validation
  const validateMainForm = () => {
    const errors: Record<string, string> = {};
    if (!form.company_id) errors.company_id = 'Select a company.';
    if (!form.supplier_id) errors.supplier_id = 'Select a supplier.';
    if (!form.invoice_no.trim()) errors.invoice_no = 'Invoice number is required.';
    if (items.length === 0) errors.items = 'Add at least one product.';
    if (form.payments.length > 0) {
      const invalidPayments = form.payments.some(p => !['inward', 'outward'].includes(p.payment_direction));
      if (invalidPayments) errors.payments = 'Each payment must have a valid direction.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const clearFieldError = (field: string) => {
    setFormErrors(prev => {
      if (!prev[field]) return prev;
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  };

  // Submit
  const handleSubmit = useCallback(async (action: 'save' | 'save_print' | 'save_draft' = 'save') => {
    setErrorMsg(null);
    if (action !== 'save_draft' && !validateMainForm()) {
      showError('Validation', 'Please fill all required fields.');
      return;
    }

    const payload = {
      company_id: Number(form.company_id),
      branch: 'Main Branch', // kept as original behavior
      supplier_id: Number(form.supplier_id),
      supplier_name: form.supplier_name,
      supplier_address: form.supplier_address,
      contact_person: form.contact_person,
      phone_no: form.phone_no,
      gstin: form.gstin_pan,
      pan: form.gstin_pan,
      reverse_charge: Boolean(form.reverse_charge),
      ship_to: form.ship_to,
      place_of_supply: form.place_of_supply,
      purchase_number: form.invoice_no,
      purchase_date: form.invoice_date,
      due_date: form.due_date || null,
      challan_no: form.challan_no || null,
      challan_date: form.challan_date || null,
      po_no: form.po_no || null,
      po_date: form.po_date || null,
      lr_no: form.lr_no || null,
      eway_no: form.eway_no || null,
      delivery_mode: form.delivery_mode || null,
      payment_type: form.payment_type,
      payment_term: form.payment_term || null,
      bank_id: form.bank_id ? Number(form.bank_id) : null,
      packing_charges: Number(form.packing_charges || 0),
      general_discount_percent: Number(form.general_discount_percent || 0),
      general_discount_amount: Number(generalDiscountAmount || 0),
      tcs_percent: Number(form.tcs_percent || 0),
      round_off: Number(form.round_off || 0),
      terms_title: form.terms_title || null,
      terms_detail: form.terms_detail || null,
      document_note: form.document_note || null,
      internal_note: form.internal_note || null,
      additional_charges: form.additional_charges.map(c => ({
        label: c.label,
        amount: Number(c.amount || 0),
      })),
      total_amount: Number(grandTotal || 0),
      tax_amount: Number(totalTax || 0),
      discount_amount: Number(itemDiscountTotal + generalDiscountAmount || 0),
      status: action === 'save_draft' ? 'draft' : 'ordered',
      items: items.map(i => ({
        product_id: Number(i.product_id),
        product_name: i.product_name,
        hsn_sac_code: i.hsn_sac_code || '',
        unit: i.uom,
        quantity: Number(i.qty || 0),
        purchase_price: Number(i.price || 0),
        discount_type: i.discount_type,
        discount_percent: i.discount_type === 'percent' ? Number(i.discount_percent) : 0,
        discount_amount: i.discount_type === 'amount' ? Number(i.discount_amount) : 0,
        gst_slab: Number(i.gst_slab || 0),
        is_inter_state: Boolean(i.is_inter_state),
        cgst_percent: Number(i.cgst_percent || 0),
        sgst_percent: Number(i.sgst_percent || 0),
        igst_percent: Number(i.igst_percent || 0),
      })),
    };

    setSubmitting(true);
    try {
      const res = await apiClient.createPurchaseInvoice(payload);
      const newPurchase = res?.data ?? res;
      if (!newPurchase?.id) {
        showSuccess('Purchase created', `Invoice ${form.invoice_no} saved, but no ID returned.`);
        navigate('/purchases');
        return;
      }

      const validPayments = form.payments.filter(p => p.amount > 0);
      if (validPayments.length > 0) {
        const paymentPromises = validPayments.map((payment, idx) =>
          apiClient.request('POST', '/payments', {
            company_id: Number(form.company_id),
            invoice_id: newPurchase.id,
            reference_no: payment.reference_no || `PAY-${newPurchase.id}-${idx + 1}`,
            amount: payment.amount,
            payment_method: payment.payment_method,
            status: 'completed',
            payment_direction: payment.payment_direction || 'outward',
            transaction_date: payment.transaction_date,
            bank_name: payment.bank_name,
            account_number: payment.account_number,
            ledger_reference: payment.reference_no || `PAY-${newPurchase.id}-${idx + 1}`,
            remarks: payment.remarks,
          })
        );
        await Promise.all(paymentPromises);
      }

      showSuccess('Purchase created', `Invoice ${form.invoice_no} created successfully.${validPayments.length ? ' Payments recorded.' : ''}`);
      addAppLog({ module: 'Purchases', action: 'Create', status: 'success', message: form.invoice_no });
      navigate('/purchases');
    } catch (err: any) {
      const errorMsg = getUserFriendlyError(err, 'Purchase invoice could not be saved.');
      showError('Save Failed', errorMsg);
      setErrorMsg(errorMsg);
    } finally {
      setSubmitting(false);
    }
  }, [form, items, grandTotal, totalTax, itemDiscountTotal, generalDiscountAmount, navigate, showSuccess, showError]);

  // Keyboard navigation for dropdowns
  const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
    if (!filteredSuppliers.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % filteredSuppliers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + filteredSuppliers.length) % filteredSuppliers.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredSuppliers.length) {
        handleSupplierSelect(filteredSuppliers[highlightIndex]);
        setHighlightIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowSupplierDropdown(false);
      setHighlightIndex(-1);
    }
  };

  const handleProductKeyDown = (e: React.KeyboardEvent) => {
    if (!filteredProducts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % filteredProducts.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + filteredProducts.length) % filteredProducts.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredProducts.length) {
        addItem(filteredProducts[highlightIndex]);
        setHighlightIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
      setHighlightIndex(-1);
    }
  };

  // Click outside handlers
  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(event.target as Node)) {
        setShowSupplierDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white outline-none transition-all duration-200 placeholder-slate-400";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1.5";
  const cardClass = "bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6 hover:shadow-xl transition-shadow";
  const sectionTitleClass = "text-lg font-semibold mb-5 flex items-center gap-2 text-slate-800";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
      {errorMsg && (
        <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2 shadow-sm">
          <FiX size={18} className="mt-0.5 shrink-0" />
          <span className="whitespace-pre-wrap">{errorMsg}</span>
        </div>
      )}

      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Supplier & Invoice Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Supplier Information */}
          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-blue-700`}><FiUser /> Supplier Information</h2>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Company *</label>
                <select 
                  value={form.company_id} 
                  onChange={e => { setForm(prev => ({ ...prev, company_id: e.target.value ? Number(e.target.value) : '', supplier_id: '' })); clearFieldError('company_id'); }} 
                  className={`${inputClass} ${formErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                >
                  <option value="">Select Company</option>
                  {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {formErrors.company_id && <p className="text-xs text-red-500 mt-1">{formErrors.company_id}</p>}
              </div>
              <div ref={supplierDropdownRef}>
                <label className={labelClass}>Supplier *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); setHighlightIndex(-1); }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onKeyDown={handleSupplierKeyDown}
                      placeholder="Search supplier..."
                      className={inputClass}
                      aria-label="Search supplier"
                    />
                    {supplierSearch && (
                      <button 
                        onClick={() => { setSupplierSearch(''); setShowSupplierDropdown(false); }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        aria-label="Clear search"
                      >
                        <FiX size={18} />
                      </button>
                    )}
                    {showSupplierDropdown && supplierSearch && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {suppliersLoading ? (
                          <div className="p-4 text-sm text-slate-500 flex items-center justify-center"><FiLoader className="animate-spin mr-2" /> Loading...</div>
                        ) : suppliersError ? (
                          <div className="p-4 text-sm text-red-500">Unable to load suppliers.</div>
                        ) : filteredSuppliers.length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">No suppliers found.</div>
                        ) : (
                          filteredSuppliers.map((s, idx) => (
                            <div
                              key={s.id}
                              className={`px-4 py-2.5 cursor-pointer text-sm flex items-center justify-between ${idx === highlightIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                              onMouseEnter={() => setHighlightIndex(idx)}
                              onClick={() => handleSupplierSelect(s)}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-800 truncate">{s.name}</div>
                                <div className="text-xs text-slate-500 truncate">
                                  {s.gst_number && <span className="mr-2">GST: {s.gst_number}</span>}
                                  {s.phone && <span className="mr-2">📞 {s.phone}</span>}
                                </div>
                              </div>
                              {idx === highlightIndex && <FiChevronRight className="text-blue-500" size={16} />}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSupplierOffcanvas(true)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors whitespace-nowrap"
                  >
                    Add Supplier
                  </button>
                </div>
                {formErrors.supplier_id && <p className="text-xs text-red-500 mt-1">{formErrors.supplier_id}</p>}
              </div>
              <div><label className={labelClass}>M/S.</label><input type="text" value={form.supplier_name} onChange={e => setForm(prev => ({ ...prev, supplier_name: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Contact Person</label><input type="text" value={form.contact_person} onChange={e => setForm(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>Phone No</label><input type="text" value={form.phone_no} onChange={e => setForm(prev => ({ ...prev, phone_no: e.target.value }))} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={labelClass}>Email</label><input type="text" value={form.email} onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))} className={inputClass} /></div>
                <div><label className={labelClass}>GSTIN / PAN</label><input type="text" value={form.gstin_pan} onChange={e => setForm(prev => ({ ...prev, gstin_pan: e.target.value }))} className={inputClass} /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reverse_charge} onChange={e => setForm(prev => ({ ...prev, reverse_charge: e.target.checked }))} className="rounded border-slate-300" /> Reverse Charge</label>
              </div>
              
              <div><label className={labelClass}>Place of Supply *</label><input type="text" value={form.place_of_supply} onChange={e => setForm(prev => ({ ...prev, place_of_supply: e.target.value }))} className={inputClass} placeholder="State / UT" /></div>
            </div>
          </div>

          {/* Right: Invoice Details */}
          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-indigo-700`}><FiFileText /> Purchase Invoice Details</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className={labelClass}>Invoice Type</label>
                  <select value={form.invoice_type} onChange={e => setForm(prev => ({ ...prev, invoice_type: e.target.value as any }))} className={inputClass}>
                    <option value="purchase_invoice">Purchase Invoice</option><option value="purchase_bill">Purchase Bill</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Invoice No. *</label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={form.invoice_no}
                      onChange={e => { setForm(prev => ({ ...prev, invoice_no: e.target.value })); clearFieldError('invoice_no'); }}
                      className={`${inputClass} flex-1 ${formErrors.invoice_no ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                      placeholder="Enter invoice number"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, invoice_no: generateInvoicePlaceholder() }))}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm flex items-center gap-1 transition-colors"
                      title="Generate unique number"
                      aria-label="Generate invoice number"
                    >
                      <FiRefreshCw size={14} />
                    </button>
                  </div>
                  {formErrors.invoice_no && <p className="text-xs text-red-500 mt-1">{formErrors.invoice_no}</p>}
                </div>
                <div><label className={labelClass}>Invoice Date *</label><input type="date" value={form.invoice_date} onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className={labelClass}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Challan No.</label><input type="text" value={form.challan_no} onChange={e => setForm(prev => ({ ...prev, challan_no: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Challan Date</label><input type="date" value={form.challan_date} onChange={e => setForm(prev => ({ ...prev, challan_date: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>L.R. No.</label><input type="text" value={form.lr_no} onChange={e => setForm(prev => ({ ...prev, lr_no: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>E-Way Bill</label><input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} /></div>
            </div>
          </div>
        </div>

        {/* Items Section */}
        <section className={`${cardClass} p-0 overflow-hidden`}>
          <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50" ref={productDropdownRef}>
            <div className="relative w-full flex gap-2">
              <div className="relative flex-1">
                <FiSearch className="absolute left-4 top-3.5 text-slate-400 z-10" size={18} />
                <input
                  type="text"
                  placeholder="Search product by name, SKU, barcode or HSN..."
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); setHighlightIndex(-1); }}
                  onFocus={() => setShowProductDropdown(true)}
                  onKeyDown={handleProductKeyDown}
                  className="w-full pl-12 pr-10 py-3 rounded-xl border-0 bg-white text-sm focus:ring-2 focus:ring-blue-500/30 outline-none transition shadow-sm"
                  aria-label="Search product"
                />
                {productSearch && (
                  <button 
                    onClick={() => { setProductSearch(''); setShowProductDropdown(false); }}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    aria-label="Clear product search"
                  >
                    <FiX size={18} />
                  </button>
                )}
                {showProductDropdown && productSearch && (
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                    {productsLoading ? (
                      <div className="p-4 text-sm text-slate-500 flex items-center justify-center"><FiLoader className="animate-spin mr-2" /> Loading...</div>
                    ) : productsError ? (
                      <div className="p-4 text-sm text-red-500">Unable to load products.</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">No products found.</div>
                    ) : (
                      filteredProducts.map((p, idx) => (
                        <div
                          key={p.id}
                          className={`px-4 py-3 cursor-pointer text-sm flex justify-between items-center border-b border-slate-100 last:border-0 ${idx === highlightIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          onClick={() => { addItem(p); setHighlightIndex(-1); }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-800 truncate">{p.name}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {p.sku && <span className="mr-2">SKU: {p.sku}</span>}
                              {p.stock_quantity != null && <span className="mr-2">Stock: {p.stock_quantity}</span>}
                              {p.uom && <span className="mr-2">UOM: {p.uom}</span>}
                              {p.barcode && <span>Barcode: {p.barcode}</span>}
                            </div>
                          </div>
                          <span className="text-slate-600 font-medium ml-3">₹{formatCurrency(p.purchase_price)}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={openProductOffcanvas}
                className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-sm font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                <FiPlus size={16} /> Add Product
              </button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-50/80">
                  <th className="py-3 px-3">Item</th>
                  <th className="py-3 px-3 text-center">Qty</th>
                  <th className="py-3 px-3 text-center">Unit</th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-3 text-center">Disc</th>
                  <th className="py-3 px-3 text-center">GST</th>
                  <th className="py-3 px-3 text-center">Inter</th>
                  <th className="py-3 px-3 text-right">Total</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      <FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.
                    </td>
                  </tr>
                ) : items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="py-2 px-3 max-w-[200px]">
                      <input 
                        type="text" 
                        value={item.product_name} 
                        onChange={e => updateItem(idx, 'product_name', e.target.value)} 
                        className="w-full bg-transparent border-0 focus:ring-0 text-sm p-1 truncate"
                        title={item.product_name}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <input 
                        type="number" 
                        min="1" 
                        step="1" 
                        inputMode="numeric"
                        value={item.qty} 
                        onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} 
                        className={`w-16 bg-transparent border-0 focus:ring-0 text-center p-1 ${item.qty <= 0 ? 'text-red-500' : ''}`}
                      />
                      {item.qty <= 0 && <div className="text-xs text-red-500 text-center">Min 1</div>}
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                    </td>
                    <td className="py-2 px-3">
                      <input 
                        type="number" 
                        min="0" 
                        step="0.01" 
                        inputMode="decimal"
                        value={item.price} 
                        onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} 
                        className={`w-20 bg-transparent border-0 focus:ring-0 text-right p-1 ${item.price < 0 ? 'text-red-500' : ''}`}
                      />
                      {item.price < 0 && <div className="text-xs text-red-500 text-right">Invalid</div>}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value="percent">%</option><option value="amount">₹</option>
                        </select>
                        {item.discount_type === 'percent' ? (
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={item.discount_percent} 
                            onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); recalcItem(idx); }} 
                            className={`w-14 bg-transparent border-0 focus:ring-0 text-center p-1 ${item.discount_percent < 0 ? 'text-red-500' : ''}`}
                          />
                        ) : (
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={item.discount_amount} 
                            onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); recalcItem(idx); }} 
                            className={`w-16 bg-transparent border-0 focus:ring-0 text-center p-1 ${item.discount_amount < 0 || item.discount_amount > item.qty * item.price ? 'text-red-500' : ''}`}
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                        <option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option>
                      </select>
                      {item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); } }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />}
                    </td>
                    <td className="py-2 px-3">
                      <label className="inline-flex items-center gap-1 text-xs cursor-pointer"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />IGST</label>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{formatCurrency(item.total)}</td>
                    <td className="py-2 px-3"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 transition-colors" aria-label="Remove item"><FiTrash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 text-slate-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</div>
            ) : items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">#{idx + 1}</span>
                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600" aria-label="Remove item"><FiTrash2 size={16} /></button>
                </div>
                <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm font-medium" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">Qty</label><input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} className={`w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs ${item.qty <= 0 ? 'border-red-400' : ''}`} />{products?.find(p => p.id === item.product_id)?.stock_quantity != null && <div className="text-xs text-slate-400 mt-1">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>}</div>
                  <div><label className="text-xs text-slate-500">Unit</label><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">Price</label><input type="number" min="0" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} className={`w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs ${item.price < 0 ? 'border-red-400' : ''}`} /></div>
                  <div><label className="text-xs text-slate-500">Disc Type</label><select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); recalcItem(idx); }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"><option value="percent">%</option><option value="amount">₹</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">Discount %</label><input type="number" min="0" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                  <div><label className="text-xs text-slate-500">Disc Amount</label><input type="number" min="0" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">GST Slab</label><select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); } }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs mt-1" />}</div>
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 flex items-center gap-1"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded border-slate-300" />IGST</label></div>
                </div>
                <div className="text-right font-semibold">₹{formatCurrency(item.total)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Invoice Info & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Invoice Information</h2>
            <div className="space-y-5">
              <div><label className={labelClass}>Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Bank</label><select value={form.bank_id} onChange={e => setForm(prev => ({ ...prev, bank_id: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}><option value="">Select Bank</option>{banks?.map(b => <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>)}</select></div>
              <div><label className={labelClass}>Terms & Conditions</label><input type="text" value={form.terms_title} onChange={e => setForm(prev => ({ ...prev, terms_title: e.target.value }))} className={inputClass} /><textarea rows={4} value={form.terms_detail} onChange={e => setForm(prev => ({ ...prev, terms_detail: e.target.value }))} className={`${inputClass} mt-2`} /></div>
              <div><label className={labelClass}>Document Note</label><textarea rows={2} value={form.document_note} onChange={e => setForm(prev => ({ ...prev, document_note: e.target.value }))} className={inputClass} /></div>
              <div><label className={labelClass}>Internal Note</label><textarea rows={2} value={form.internal_note} onChange={e => setForm(prev => ({ ...prev, internal_note: e.target.value }))} className={inputClass} /></div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{formatCurrency(itemSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Bill Discount</span><span className="text-red-500">-₹{formatCurrency(itemDiscountTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxable Amount</span><span>₹{formatCurrency(itemTaxableTotal)}</span></div>
              {!items.every(i => i.is_inter_state) && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">CGST</span><span>₹{formatCurrency(itemCgstTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">SGST</span><span>₹{formatCurrency(itemSgstTotal)}</span></div>
                </>
              )}
              {items.some(i => i.is_inter_state) && (
                <div className="flex justify-between"><span className="text-slate-500">IGST</span><span>₹{formatCurrency(itemIgstTotal)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Additional Charges</span><span>₹{formatCurrency(additionalChargesTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Packing Charges</span><span>₹{formatCurrency(form.packing_charges)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TCS</span><span>₹{formatCurrency(tcsAmount)}</span></div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={autoRoundOff} onChange={e => setAutoRoundOff(e.target.checked)} className="rounded border-slate-300" />
                  Auto round off
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.round_off}
                  onChange={e => setForm(prev => ({ ...prev, round_off: Number(e.target.value) }))}
                  disabled={autoRoundOff}
                  className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none"
                />
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800"><span>Grand Total</span><span>₹{formatCurrency(grandTotal)}</span></div>
              <div className="text-xs text-slate-500 mt-1">{totalInWords}</div>

              {/* Payments Section */}
              <div className="mt-6 border-t border-slate-100 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">Payments</h3>
                  <button onClick={addPayment} className="text-blue-600 text-xs flex items-center gap-1 hover:underline" aria-label="Add payment"><FiPlus size={14} /> Add Payment</button>
                </div>
                {form.payments.length === 0 && <p className="text-xs text-slate-400">No payments recorded.</p>}
                <div className="space-y-3">
                  {form.payments.map((pay, idx) => (
                    <div key={pay.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-slate-500">Payment #{idx + 1}</span>
                        <button onClick={() => removePayment(pay.id)} className="text-red-400 hover:text-red-600" aria-label="Remove payment"><FiTrash2 size={14} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500">Amount</label>
                          <input type="number" min="0" step="0.01" inputMode="decimal" value={pay.amount} onChange={e => updatePayment(pay.id, 'amount', Number(e.target.value))} className={`w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none ${pay.amount < 0 ? 'border-red-400' : ''}`} />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500">Method</label>
                          <select value={pay.payment_method} onChange={e => updatePayment(pay.id, 'payment_method', e.target.value as any)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none">
                            <option value="UPI">UPI</option>
                            <option value="cash">Cash</option>
                            <option value="cheque">Cheque</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500">Reference No</label>
                          <input type="text" value={pay.reference_no} onChange={e => updatePayment(pay.id, 'reference_no', e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500">Date</label>
                          <input type="date" value={pay.transaction_date} onChange={e => updatePayment(pay.id, 'transaction_date', e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500">Direction *</label>
                          <select value={pay.payment_direction} onChange={e => updatePayment(pay.id, 'payment_direction', e.target.value as 'inward' | 'outward')} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none">
                            <option value="outward">Outward (Pay Supplier)</option>
                            <option value="inward">Inward (Refund)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500">Bank Name</label>
                          <input type="text" value={pay.bank_name} onChange={e => updatePayment(pay.id, 'bank_name', e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-slate-500">Remarks</label>
                          <input type="text" value={pay.remarks} onChange={e => updatePayment(pay.id, 'remarks', e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500/30 outline-none" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-3 text-sm font-medium">
                  <span className="text-slate-600">Total Paid</span>
                  <span>₹{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between mt-1 text-sm font-medium">
                  <span className="text-slate-600">Balance Due</span>
                  <span className={balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{formatCurrency(balanceDue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-2xl p-4 flex flex-wrap justify-end gap-3 z-30">
        <button onClick={() => navigate('/purchases')} className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
        
        <button onClick={() => handleSubmit('save_print')} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 text-sm flex items-center gap-2 shadow-lg shadow-cyan-400/30 transition-all disabled:opacity-50">
          {submitting ? <FiLoader className="animate-spin" size={16} /> : <FiPrinter size={16} />} Print & Save
        </button>
      </div>

      {/* Supplier Offcanvas */}
      {showSupplierOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showSupplierOffcanvas}
            title="Add Supplier"
            onClose={() => setShowSupplierOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowSupplierOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 transition-colors" disabled={supplierSubmitting}>Close</button>
                <button onClick={createSupplier} disabled={supplierSubmitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {supplierSubmitting ? 'Creating...' : 'Create Supplier'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={labelClass}>Company *</label>
                    <select value={newSupplier.company_id} onChange={e => setNewSupplier(prev => ({ ...prev, company_id: e.target.value }))} className={inputClass}>
                      <option value="">Select Company</option>
                      {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Supplier Name *</label>
                    <input type="text" value={newSupplier.name} onChange={e => setNewSupplier(prev => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="e.g., ABC Traders" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Contact Person</label><input type="text" value={newSupplier.contact_person} onChange={e => setNewSupplier(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} /></div>
                    <div><label className={labelClass}>Contact No</label><input type="text" value={newSupplier.contact_no} onChange={e => setNewSupplier(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Email</label><input type="email" value={newSupplier.email} onChange={e => setNewSupplier(prev => ({ ...prev, email: e.target.value }))} className={inputClass} /></div>
                    <div><label className={labelClass}>Phone</label><input type="text" value={newSupplier.phone} onChange={e => setNewSupplier(prev => ({ ...prev, phone: e.target.value }))} className={inputClass} /></div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Tax Details</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div><label className={labelClass}>GST Number</label><input type="text" value={newSupplier.gst_number} onChange={e => setNewSupplier(prev => ({ ...prev, gst_number: e.target.value }))} className={inputClass} /></div>
                  <div><label className={labelClass}>PAN</label><input type="text" value={newSupplier.pan} onChange={e => setNewSupplier(prev => ({ ...prev, pan: e.target.value }))} className={inputClass} /></div>
                </div>
              </fieldset>

              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Billing Address</legend>
                <div className="mt-3 space-y-3">
                  <textarea rows={2} value={newSupplier.billing_street} onChange={e => setNewSupplier(prev => ({ ...prev, billing_street: e.target.value }))} className={inputClass} placeholder="Street Address" />
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>City</label><input type="text" value={newSupplier.billing_city} onChange={e => setNewSupplier(prev => ({ ...prev, billing_city: e.target.value }))} className={inputClass} /></div>
                    <div><label className={labelClass}>State</label><input type="text" value={newSupplier.billing_state} onChange={e => setNewSupplier(prev => ({ ...prev, billing_state: e.target.value }))} className={inputClass} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className={labelClass}>Country</label><input type="text" value={newSupplier.billing_country} onChange={e => setNewSupplier(prev => ({ ...prev, billing_country: e.target.value }))} className={inputClass} /></div>
                    <div><label className={labelClass}>Pincode</label><input type="text" value={newSupplier.billing_pincode} onChange={e => setNewSupplier(prev => ({ ...prev, billing_pincode: e.target.value }))} className={inputClass} /></div>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Product Offcanvas */}
      {showProductOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showProductOffcanvas}
            title="Add Product"
            onClose={() => setShowProductOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowProductOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 transition-colors" disabled={productSubmitting}>Close</button>
                <button onClick={createProduct} disabled={productSubmitting} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                  {productSubmitting ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Company *</label>
                      <select value={newProduct.company_id} onChange={e => setNewProduct(prev => ({ ...prev, company_id: e.target.value }))} className={`${inputClass} ${productFormErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}>
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Branch</label>
                      <select value={newProduct.branch_id} onChange={e => setNewProduct(prev => ({ ...prev, branch_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Branch</option>
                        {/* Branches would be loaded here based on company */}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Product Name *</label>
                    <input type="text" value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className={`${inputClass} ${productFormErrors.name ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Steel Rod" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>SKU (optional)</label><input type="text" value={newProduct.sku} onChange={e => setNewProduct(prev => ({ ...prev, sku: e.target.value }))} className={inputClass} placeholder="Auto-generated if blank" /></div>
                    <div><label className={labelClass}>HSN/SAC Code</label><input type="text" value={newProduct.hsn_sac_code} onChange={e => setNewProduct(prev => ({ ...prev, hsn_sac_code: e.target.value }))} className={inputClass} placeholder="e.g., 7308" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Unit *</label><input type="text" value={newProduct.unit} onChange={e => setNewProduct(prev => ({ ...prev, unit: e.target.value }))} className={`${inputClass} ${productFormErrors.unit ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Piece, Kg" /></div>
                    <div><label className={labelClass}>Purchase Price (₹) *</label><input type="number" step="0.01" value={newProduct.purchase_price} onChange={e => setNewProduct(prev => ({ ...prev, purchase_price: e.target.value }))} className={`${inputClass} ${productFormErrors.purchase_price ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="0.00" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Sale Price (₹)</label><input type="number" step="0.01" value={newProduct.sale_price} onChange={e => setNewProduct(prev => ({ ...prev, sale_price: e.target.value }))} className={inputClass} placeholder="0.00" /></div>
                    <div><label className={labelClass}>Tax Rate (%)</label><input type="number" step="0.01" value={newProduct.tax_rate} onChange={e => setNewProduct(prev => ({ ...prev, tax_rate: e.target.value }))} className={inputClass} /></div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Stock & Notes</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div><label className={labelClass}>Stock Quantity</label><input type="number" value={newProduct.stock_quantity} onChange={e => setNewProduct(prev => ({ ...prev, stock_quantity: e.target.value }))} className={inputClass} /></div>
                  <div><label className={labelClass}>Reorder Level</label><input type="number" value={newProduct.reorder_level} onChange={e => setNewProduct(prev => ({ ...prev, reorder_level: e.target.value }))} className={inputClass} /></div>
                </div>
                <div className="mt-4">
                  <label className={labelClass}>Description</label>
                  <textarea rows={2} value={newProduct.description} onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))} className={inputClass} placeholder="Optional description" />
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}