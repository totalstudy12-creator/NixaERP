// src/pages/EditInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiCreditCard, FiGlobe, FiLoader, FiPackage,
  FiChevronDown, FiChevronUp, FiRefreshCw, FiCheckCircle, FiChevronRight
} from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const Offcanvas = lazy(() => import('../components/Offcanvas').then(m => ({ default: m.Offcanvas })));

// ── Types ──
interface Company { id: number; name: string; }
interface Branch { id: number; name: string; company_id: number; }
interface Customer {
  id: number; name: string; code?: string; email?: string; phone?: string;
  gstin?: string; pan?: string;
  billing_street?: string; billing_city?: string; billing_state?: string; billing_country?: string; billing_pincode?: string;
  shipping_street?: string; shipping_city?: string; shipping_state?: string; shipping_country?: string; shipping_pincode?: string;
  contact_person?: string; contact_no?: string;
  type?: string;
  company_id?: number;
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string;
  price: number | string; sale_price?: number | string; tax_rate?: number | string; igst_rate?: number | string;
  stock_quantity?: number | string; unit?: string; sku?: string; barcode?: string;
}
interface BankAccount { id: number; bank_name: string; account_no: string; }

interface InvoiceItem {
  product_id: number;
  product_name: string;
  hsn_sac_code: string;
  qty: number;
  uom: string;
  price: number;
  discount_type: 'percent' | 'amount';
  discount_percent: number;
  discount_amount: number;
  gst_slab: number;
  is_inter_state: boolean;
  cgst_percent: number;
  sgst_percent: number;
  igst_percent: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total: number;
}

interface AdditionalCharge { id: string; label: string; amount: number; }

interface PaymentEntry {
  id: string;
  amount: number;
  payment_method: 'UPI' | 'cash' | 'cheque' | 'other';
  reference_no: string;
  transaction_date: string;
  bank_name: string;
  account_number: string;
  remarks: string;
  payment_direction?: 'inward' | 'outward';
}

interface InvoiceFormData {
  company_id: number | '';
  branch_id: number | '';
  customer_id: number | '';
  customer_name: string;
  billing_street: string; billing_city: string; billing_state: string; billing_country: string; billing_pincode: string;
  shipping_street: string; shipping_city: string; shipping_state: string; shipping_country: string; shipping_pincode: string;
  contact_person: string; contact_no: string;
  gstin_pan: string;
  invoice_type: 'tax_invoice' | 'retail_invoice' | 'export_invoice';
  invoice_no: string;
  invoice_date: string;
  challan_no: string; challan_date: string;
  po_no: string; po_date: string;
  lr_no: string; eway_no: string; delivery_mode: string;
  payment_term: string;
  bank_id: number | '';
  packing_charges: number;
  general_discount_percent: number;
  general_discount_amount: number;
  tcs_percent: number;
  terms_title: string;
  terms_detail: string;
  document_note: string;
  additional_charges: AdditionalCharge[];
  internal_note: string;
  payments: PaymentEntry[];
  status: string;
}

// ── Pure calculation functions ──
function calculateItem(item: Omit<InvoiceItem, 'cgst_percent' | 'sgst_percent' | 'igst_percent' | 'cgst_amount' | 'sgst_amount' | 'igst_amount' | 'total'>): InvoiceItem {
  const base = item.qty * item.price;
  const discountAmount = item.discount_type === 'percent'
    ? base * (item.discount_percent / 100)
    : item.discount_amount;

  const afterDiscount = Math.max(0, base - discountAmount);
  const slab = item.gst_slab || 0;

  let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
  if (item.is_inter_state) {
    igst_amount = afterDiscount * (slab / 100);
  } else {
    const half = slab / 2;
    cgst_amount = afterDiscount * (half / 100);
    sgst_amount = afterDiscount * (half / 100);
  }

  return {
    ...item,
    discount_amount: discountAmount,
    cgst_percent: item.is_inter_state ? 0 : slab / 2,
    sgst_percent: item.is_inter_state ? 0 : slab / 2,
    igst_percent: item.is_inter_state ? slab : 0,
    cgst_amount,
    sgst_amount,
    igst_amount,
    total: afterDiscount + cgst_amount + sgst_amount + igst_amount,
  };
}

function calculateSummary(items: InvoiceItem[], form: InvoiceFormData) {
  const itemSubtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + i.discount_amount, 0);
  const totalTax = items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0);
  const cgstTotal = items.reduce((s, i) => s + i.cgst_amount, 0);
  const sgstTotal = items.reduce((s, i) => s + i.sgst_amount, 0);
  const igstTotal = items.reduce((s, i) => s + i.igst_amount, 0);
  const itemTaxableTotal = itemSubtotal - itemDiscountTotal;

  const generalDiscountAmount = form.general_discount_percent
    ? (itemTaxableTotal * form.general_discount_percent) / 100
    : form.general_discount_amount;

  const additionalChargesTotal = form.additional_charges.reduce((s, c) => s + (c.amount || 0), 0);
  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + form.packing_charges;
  const tcsAmount = totalBeforeTcs * (form.tcs_percent / 100);
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;
  const grandTotal = Math.round(totalBeforeRoundOff);
  const roundOff = grandTotal - totalBeforeRoundOff;

  const totalPaid = form.payments
    .filter(p => p.id.startsWith('existing_'))
    .reduce((s, p) => s + (p.amount || 0), 0);

  return {
    itemSubtotal,
    itemDiscountTotal,
    totalTax,
    cgstTotal,
    sgstTotal,
    igstTotal,
    itemTaxableTotal,
    generalDiscountAmount,
    additionalChargesTotal,
    totalBeforeTcs,
    tcsAmount,
    totalBeforeRoundOff,
    roundOff,
    grandTotal,
    totalPaid,
    balanceDue: grandTotal - totalPaid,
  };
}

// ── Number to words ──
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

// ── API Cache ──
const cache = new Map<string, { data: any; timestamp: number }>();

function extractArray<T>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res?.data && Array.isArray(res.data)) return res.data as T[];
  if (res?.data && typeof res.data === 'object' && Array.isArray(res.data.data)) return res.data.data as T[];
  if (res?.results && Array.isArray(res.results)) return res.results as T[];
  if (res?.data && res.data.results && Array.isArray(res.data.results)) return res.data.results as T[];
  return [];
}

function useApiCache<T>(key: string, fetcher: () => Promise<T[]>, ttlMs = 300_000) {
  const [data, setData] = useState<T[] | null>(null);
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
      const result = extractArray<T>(res);
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) {
      console.error('API error:', err);
      setError('Unable to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

// Helper to safely format currency
function formatCurrency(value: number | string | undefined | null): string {
  const num = Number(value);
  return isNaN(num) ? '0.00' : num.toFixed(2);
}

// Helper to sanitize API error message
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

// ── Main Component ──
export function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  // Fetch all data
  const getCompanies = useCallback(async () => await apiClient.getCompanies(), []);
  const getCustomers = useCallback(async () => await apiClient.getAllCustomers(), []);
  const getProducts = useCallback(async () => await apiClient.getAllProducts(), []);
  const getBanks = useCallback(async () => {
    try { return await apiClient.request('GET', '/banks'); } catch { return []; }
  }, []);

  const { data: companies, loading: companiesLoading } = useApiCache<Company>('companies', getCompanies);
  const { data: customers, loading: customersLoading, error: customersError, refresh: refreshCustomers } = useApiCache<Customer>('customers', getCustomers);
  const { data: products, loading: productsLoading, error: productsError, refresh: refreshProducts } = useApiCache<Product>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount>('banks', getBanks);

  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [invoiceNotFound, setInvoiceNotFound] = useState(false);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Main form state
  const [form, setForm] = useState<InvoiceFormData>({
    company_id: '',
    branch_id: '',
    customer_id: '',
    customer_name: '',
    billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
    shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
    contact_person: '', contact_no: '',
    gstin_pan: '',
    invoice_type: 'tax_invoice',
    invoice_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    challan_no: '', challan_date: '',
    po_no: '', po_date: '',
    lr_no: '', eway_no: '', delivery_mode: '',
    payment_term: '',
    bank_id: '',
    packing_charges: 0,
    general_discount_percent: 0,
    general_discount_amount: 0,
    tcs_percent: 0,
    terms_title: 'Terms and Conditions',
    terms_detail: '1. Subject to our home Jurisdiction.\n2. Our Responsibility Ceases as soon as goods leaves our Premises.\n3. Goods once sold will not taken back.\n4. Delivery Ex-Premises.\n5. Warranty (if any) is provided by the manufacturer.\nJurisdiction:',
    document_note: '',
    additional_charges: [],
    internal_note: '',
    payments: [],
    status: 'pending',
  });

  // Dirty state for unsaved changes
  const [isDirty, setIsDirty] = useState(false);
  const initialForm = useRef(JSON.stringify(form));
  const initialItems = useRef(JSON.stringify(items));

  useEffect(() => {
    const currentForm = JSON.stringify(form);
    const currentItems = JSON.stringify(items);
    setIsDirty(currentForm !== initialForm.current || currentItems !== initialItems.current);
  }, [form, items]);

  // Warn before leaving page
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

  // Load invoice data
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const response = await apiClient.getInvoice(Number(id));
        const inv = response.data || response;
        setForm({
          company_id: inv.company_id || '',
          branch_id: inv.branch_id || (inv.branch ? Number(inv.branch) : '') || '',
          customer_id: inv.customer_id || '',
          customer_name: inv.customer_name || '',
          billing_street: inv.billing_street || '',
          billing_city: inv.billing_city || '',
          billing_state: inv.billing_state || '',
          billing_country: inv.billing_country || 'India',
          billing_pincode: inv.billing_pincode || '',
          shipping_street: inv.shipping_street || '',
          shipping_city: inv.shipping_city || '',
          shipping_state: inv.shipping_state || '',
          shipping_country: inv.shipping_country || 'India',
          shipping_pincode: inv.shipping_pincode || '',
          contact_person: inv.contact_person || '',
          contact_no: inv.contact_no || '',
          gstin_pan: inv.gstin || inv.pan || '',
          invoice_type: inv.invoice_type || 'tax_invoice',
          invoice_no: inv.invoice_no || '',
          invoice_date: inv.invoice_date?.split('T')[0] || new Date().toISOString().split('T')[0],
          challan_no: inv.challan_no || '',
          challan_date: inv.challan_date?.split('T')[0] || '',
          po_no: inv.po_no || '',
          po_date: inv.po_date?.split('T')[0] || '',
          lr_no: inv.lr_no || '',
          eway_no: inv.eway_no || '',
          delivery_mode: inv.delivery_mode || '',
          payment_term: inv.payment_term || '',
          bank_id: inv.bank_id || '',
          packing_charges: Number(inv.packing_charges) || 0,
          general_discount_percent: Number(inv.general_discount_percent) || 0,
          general_discount_amount: Number(inv.general_discount_amount) || 0,
          tcs_percent: Number(inv.tcs_percent) || 0,
          terms_title: inv.terms_title || 'Terms and Conditions',
          terms_detail: inv.terms_detail || '',
          document_note: inv.document_note || '',
          additional_charges: Array.isArray(inv.additional_charges) ? inv.additional_charges : [],
          internal_note: inv.internal_note || '',
          payments: Array.isArray(inv.payments)
            ? inv.payments.map((p: any) => ({
                id: `existing_${p.id ?? Date.now()}`,
                amount: Number(p.amount) || 0,
                payment_method: p.payment_method || 'cash',
                reference_no: p.reference_no || '',
                transaction_date: p.transaction_date?.split('T')[0] || '',
                bank_name: p.bank_name || '',
                account_number: p.account_number || '',
                remarks: p.remarks || '',
                payment_direction: p.payment_direction || 'inward',
              }))
            : [],
          status: inv.status || 'pending',
        });

        const loadedItems: InvoiceItem[] = (inv.items || []).map((it: any) => {
          const baseItem = {
            product_id: it.product_id,
            product_name: it.product?.name || it.product_name || `Product #${it.product_id}`,
            hsn_sac_code: it.product?.hsn_sac_code || '',
            qty: Number(it.quantity ?? it.qty) || 1,
            uom: it.product?.uom || it.uom || 'NOS',
            price: Number(it.unit_price ?? it.price) || 0,
            discount_type: (it.discount_type as 'percent' | 'amount') || 'percent',
            discount_percent: Number(it.discount_percent) || 0,
            discount_amount: Number(it.discount_amount) || 0,
            gst_slab: it.gst_slab ?? it.igst_percent ?? it.product?.igst_rate ?? it.product?.tax_rate ?? 0,
            is_inter_state: it.is_inter_state ?? ((it.gst_slab || it.igst_percent) ? true : false),
          };
          return calculateItem(baseItem);
        });
        setItems(loadedItems);
        setLoadingInvoice(false);
      } catch (err: any) {
        showError('Error', 'Invoice not found.');
        setInvoiceNotFound(true);
        setLoadingInvoice(false);
      }
    })();
  }, [id, showError]);

  // Fetch branches when company changes
  useEffect(() => {
    if (!form.company_id) {
      setAvailableBranches([]);
      setForm(prev => ({ ...prev, branch_id: '' }));
      return;
    }
    setBranchLoading(true);
    setBranchError(null);
    apiClient.getBranchesByCompany(Number(form.company_id))
      .then(res => {
        const branchList = Array.isArray(res) ? res : (res?.data ?? []);
        setAvailableBranches(branchList);
        setForm(prev => {
          if (!prev.branch_id || !branchList.some((b: any) => b.id === Number(prev.branch_id))) {
            return { ...prev, branch_id: branchList.length ? branchList[0].id : '' };
          }
          return prev;
        });
      })
      .catch(() => {
        setAvailableBranches([]);
        setForm(prev => ({ ...prev, branch_id: '' }));
        setBranchError('Unable to load branches.');
      })
      .finally(() => setBranchLoading(false));
  }, [form.company_id]);

  // Auto-fill customer info when selected
  useEffect(() => {
    if (form.customer_id && customers) {
      const cust = customers.find(c => c.id === Number(form.customer_id));
      if (cust) {
        setForm(prev => ({
          ...prev,
          customer_name: cust.name || '',
          billing_street: cust.billing_street || '',
          billing_city: cust.billing_city || '',
          billing_state: cust.billing_state || '',
          billing_country: cust.billing_country || 'India',
          billing_pincode: cust.billing_pincode || '',
          shipping_street: cust.shipping_street || cust.billing_street || '',
          shipping_city: cust.shipping_city || cust.billing_city || '',
          shipping_state: cust.shipping_state || cust.billing_state || '',
          shipping_country: cust.shipping_country || cust.billing_country || 'India',
          shipping_pincode: cust.shipping_pincode || cust.billing_pincode || '',
          contact_person: cust.contact_person || '',
          contact_no: cust.contact_no || '',
          gstin_pan: cust.gstin || cust.pan || '',
        }));
        setCustomerSearch(cust.name);
      }
    }
  }, [form.customer_id, customers]);

  // Search states
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Customer creation offcanvas state
  const [showCustomerOffcanvas, setShowCustomerOffcanvas] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    company_id: '', branch_id: '', type: 'customer',
    name: '', contact_person: '', contact_no: '', email: '', phone: '',
    gst_number: '', registration_type: '', pan: '',
    billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
    shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
    same_as_billing: true, group_id: '', opening_balance: 0, credit_limit: 0, due_days: 0,
    fax: '', website: '', note: '', license_no: '', custom_field_1: '', custom_field_2: '', is_active: true,
  });
  const [customerFormErrors, setCustomerFormErrors] = useState<Record<string, boolean>>({});
  const [customerSubmitting, setCustomerSubmitting] = useState(false);

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
    tax_rate: '0',
    stock_quantity: '0',
    purchase_price: '0',
    reorder_level: '0',
    description: '',
  });
  const [productFormErrors, setProductFormErrors] = useState<Record<string, boolean>>({});

  // Filtered lists with memoization
  const filteredCustomers = useMemo(() => {
    if (!customers || !Array.isArray(customers)) return [];
    let list = customers;
    if (form.company_id) {
      list = list.filter(c => !c.company_id || c.company_id === Number(form.company_id));
    }
    const term = customerSearch.toLowerCase().trim();
    if (!term) return list;
    return list.filter(c => 
      c.name?.toLowerCase().includes(term) ||
      (c.code && c.code.toLowerCase().includes(term)) ||
      (c.gstin && c.gstin.toLowerCase().includes(term)) ||
      (c.contact_no && c.contact_no.includes(term))
    );
  }, [customers, customerSearch, form.company_id]);

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

  // Item management
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) {
      showError('Duplicate', 'Product already in list.');
      return;
    }
    const baseItem = {
      product_id: product.id,
      product_name: product.name,
      hsn_sac_code: product.hsn_sac_code || '',
      qty: 1,
      uom: product.uom || product.unit || 'NOS',
      price: Number(product.sale_price || product.price || 0),
      discount_type: 'percent' as const,
      discount_percent: 0,
      discount_amount: 0,
      gst_slab: Number(product.igst_rate || product.tax_rate || 0),
      is_inter_state: true,
    };
    const calculatedItem = calculateItem(baseItem);
    setItems(prev => [...prev, calculatedItem]);
    setProductSearch('');
    setShowProductDropdown(false);
  }, [items, showError]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      updated[index] = calculateItem(item);
      return updated;
    });
  }, []);

  // Additional charges
  const addAdditionalCharge = () => {
    setForm(prev => ({
      ...prev,
      additional_charges: [...prev.additional_charges, { id: Date.now().toString(), label: '', amount: 0 }]
    }));
  };
  const updateAdditionalCharge = (id: string, field: 'label' | 'amount', value: any) => {
    setForm(prev => ({
      ...prev,
      additional_charges: prev.additional_charges.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  };
  const removeAdditionalCharge = (id: string) => {
    setForm(prev => ({
      ...prev,
      additional_charges: prev.additional_charges.filter(c => c.id !== id)
    }));
  };

  // Payment management
  const addPayment = () => {
    const newPayment: PaymentEntry = {
      id: `new_${Date.now()}`,
      amount: 0,
      payment_method: 'cash',
      reference_no: '',
      transaction_date: new Date().toISOString().split('T')[0],
      bank_name: '',
      account_number: '',
      remarks: '',
      payment_direction: 'inward',
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

  // Summary
  const summary = useMemo(() => calculateSummary(items, form), [items, form]);
  const totalInWords = useMemo(() => numberToWordsINR(summary.grandTotal), [summary.grandTotal]);

  // Validation
  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.company_id) errors.company_id = 'Select a company.';
    if (!form.branch_id) errors.branch_id = 'Select a branch.';
    if (!form.customer_id) errors.customer_id = 'Select a customer.';
    if (!form.invoice_no.trim()) errors.invoice_no = 'Invoice number is required.';
    if (items.length === 0) errors.items = 'Add at least one product.';
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

  // Submit update
  const handleUpdate = useCallback(async () => {
    setErrorMsg(null);
    if (!validate()) {
      showError('Validation', 'Please fill all required fields.');
      return;
    }

    const payload = {
      company_id: Number(form.company_id),
      branch_id: form.branch_id || null,
      customer_id: Number(form.customer_id),
      customer_name: form.customer_name,
      billing_street: form.billing_street,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_country: form.billing_country,
      billing_pincode: form.billing_pincode,
      shipping_street: form.shipping_street,
      shipping_city: form.shipping_city,
      shipping_state: form.shipping_state,
      shipping_country: form.shipping_country,
      shipping_pincode: form.shipping_pincode,
      contact_person: form.contact_person,
      contact_no: form.contact_no,
      gstin: form.gstin_pan,
      pan: form.gstin_pan,
      invoice_type: form.invoice_type,
      invoice_no: form.invoice_no,
      invoice_date: form.invoice_date,
      challan_no: form.challan_no,
      challan_date: form.challan_date,
      po_no: form.po_no,
      po_date: form.po_date,
      lr_no: form.lr_no,
      eway_no: form.eway_no,
      delivery_mode: form.delivery_mode,
      payment_term: form.payment_term,
      bank_id: form.bank_id || null,
      packing_charges: form.packing_charges,
      general_discount_percent: form.general_discount_percent,
      general_discount_amount: form.general_discount_amount,
      tcs_percent: form.tcs_percent,
      terms_title: form.terms_title,
      terms_detail: form.terms_detail,
      document_note: form.document_note,
      internal_note: form.internal_note,
      additional_charges: form.additional_charges,
      status: form.status,
      total_amount: summary.grandTotal,
      tax_amount: summary.totalTax,
      discount_amount: summary.itemDiscountTotal + summary.generalDiscountAmount,
      items: items.map(item => ({
        product_id: item.product_id,
        quantity: item.qty,
        unit_price: item.price,
        discount_type: item.discount_type,
        discount_percent: item.discount_percent,
        discount_amount: item.discount_amount,
        gst_slab: item.gst_slab,
        is_inter_state: item.is_inter_state,
        cgst_percent: item.cgst_percent,
        sgst_percent: item.sgst_percent,
        igst_percent: item.igst_percent,
        cgst_amount: item.cgst_amount,
        sgst_amount: item.sgst_amount,
        igst_amount: item.igst_amount,
        total: item.total,
      })),
    };

    setSubmitting(true);
    try {
      await apiClient.updateInvoice(Number(id), payload);

      const newPayments = form.payments.filter(
        (p) => p.id.startsWith('new_') && p.amount > 0
      );
      if (newPayments.length > 0) {
        const paymentPromises = newPayments.map((payment, idx) =>
          apiClient.request('POST', '/payments', {
            company_id: Number(form.company_id),
            invoice_id: Number(id),
            reference_no: payment.reference_no || `PAY-${id}-${idx + 1}`,
            amount: payment.amount,
            payment_method: payment.payment_method,
            status: 'completed',
            payment_direction: 'inward',
            transaction_date: payment.transaction_date,
            bank_name: payment.bank_name,
            account_number: payment.account_number,
            ledger_reference: payment.reference_no || `PAY-${id}-${idx + 1}`,
            remarks: payment.remarks,
          })
        );
        await Promise.all(paymentPromises);
      }

      showSuccess('Invoice updated', `Invoice ${form.invoice_no} updated.`);
      addAppLog({ module: 'Invoices', action: 'Update', status: 'success', message: form.invoice_no });
      navigate('/invoices');
    } catch (err: any) {
      const errorMsg = getUserFriendlyError(err, 'Invoice could not be updated.');
      showError('Update failed', errorMsg);
    } finally {
      setSubmitting(false);
    }
  }, [form, id, items, summary, navigate, showSuccess, showError]);

  // Customer creation from offcanvas
  const createCustomer = async () => {
    if (!newCustomer.name.trim()) { showError('Validation', 'Customer name is required.'); return; }
    if (!newCustomer.company_id) { showError('Validation', 'Company is required.'); return; }
    if (!newCustomer.billing_city.trim()) { showError('Validation', 'Billing city is required.'); return; }
    try {
      const created = await apiClient.createCustomer({
        ...newCustomer,
        company_id: Number(newCustomer.company_id),
        branch_id: newCustomer.branch_id ? Number(newCustomer.branch_id) : null,
        group_id: newCustomer.group_id ? Number(newCustomer.group_id) : null,
      });
      showSuccess('Customer created', `${created.name} added.`);
      refreshCustomers();
      setForm(prev => ({ ...prev, customer_id: created.id }));
      setShowCustomerOffcanvas(false);
      setNewCustomer({
        company_id: '', branch_id: '', type: 'customer',
        name: '', contact_person: '', contact_no: '', email: '', phone: '',
        gst_number: '', registration_type: '', pan: '',
        billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
        shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
        same_as_billing: true, group_id: '', opening_balance: 0, credit_limit: 0, due_days: 0,
        fax: '', website: '', note: '', license_no: '', custom_field_1: '', custom_field_2: '', is_active: true,
      });
    } catch (err: any) {
      const errorMsg = getUserFriendlyError(err, 'Customer creation failed.');
      showError('Create failed', errorMsg);
    }
  };

  // Product creation
  const generateProductSKU = useCallback(() => {
    if (!products) return 'FU-001';
    const prefix = 'FU-';
    let maxNum = 0;
    products.forEach(p => {
      if (p.sku && p.sku.startsWith(prefix)) {
        const num = parseInt(p.sku.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `${prefix}${(maxNum + 1).toString().padStart(3, '0')}`;
  }, [products]);

  const createProduct = async () => {
    const errors: Record<string, boolean> = {};
    if (!newProduct.company_id) errors.company_id = true;
    if (!newProduct.name.trim()) errors.name = true;
    if (!newProduct.sale_price || parseFloat(newProduct.sale_price) < 0) errors.sale_price = true;
    if (!newProduct.unit.trim()) errors.unit = true;
    setProductFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Validation', 'Please fill in required fields (Company, Name, Sale Price, Unit).');
      return;
    }

    let sku = newProduct.sku.trim();
    if (!sku) sku = generateProductSKU();

    const payload = {
      company_id: Number(newProduct.company_id),
      branch_id: newProduct.branch_id ? Number(newProduct.branch_id) : null,
      name: newProduct.name.trim(),
      sku,
      hsn_sac_code: newProduct.hsn_sac_code.trim(),
      unit: newProduct.unit.trim(),
      sale_price: parseFloat(newProduct.sale_price),
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
        company_id: '', branch_id: '', name: '', sku: '', hsn_sac_code: '',
        unit: 'Piece', sale_price: '', tax_rate: '0', stock_quantity: '0',
        purchase_price: '0', reorder_level: '0', description: '',
      });
      if (created?.id && created?.name && created?.sale_price !== undefined) {
        const productToAdd: Product = {
          id: created.id,
          name: created.name,
          hsn_sac_code: created.hsn_sac_code || '',
          uom: created.unit || 'NOS',
          price: created.sale_price || 0,
          sale_price: created.sale_price,
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

  const openCustomerOffcanvas = () => {
    setNewCustomer(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
      branch_id: form.branch_id ? String(form.branch_id) : '',
    }));
    setShowCustomerOffcanvas(true);
  };

  const openProductOffcanvas = () => {
    setNewProduct(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
      branch_id: form.branch_id ? String(form.branch_id) : '',
    }));
    setProductFormErrors({});
    setShowProductOffcanvas(true);
  };

  // Dropdown keyboard navigation
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

  const handleCustomerKeyDown = (e: React.KeyboardEvent) => {
    if (!filteredCustomers.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % filteredCustomers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + filteredCustomers.length) % filteredCustomers.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredCustomers.length) {
        const c = filteredCustomers[highlightIndex];
        setForm(prev => ({ ...prev, customer_id: c.id }));
        setCustomerSearch('');
        setShowCustomerDropdown(false);
        setHighlightIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setShowCustomerDropdown(false);
      setHighlightIndex(-1);
    }
  };

  // Click outside handlers
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Shipping address toggle
  const [showShipping, setShowShipping] = useState(false);
  const toggleShipping = () => {
    if (!showShipping) {
      setForm(prev => ({
        ...prev,
        shipping_street: prev.billing_street,
        shipping_city: prev.billing_city,
        shipping_state: prev.billing_state,
        shipping_country: prev.billing_country,
        shipping_pincode: prev.billing_pincode,
      }));
    }
    setShowShipping(prev => !prev);
  };

  if (loadingInvoice) return <div className="p-8 text-center">Loading invoice...</div>;
  if (invoiceNotFound) return <div className="p-8 text-center text-red-500">Invoice not found. <Link to="/invoices">Go back</Link></div>;

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white outline-none transition-all duration-200 placeholder-slate-400";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1.5";
  const cardClass = "bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6 hover:shadow-xl transition-shadow";
  const sectionTitleClass = "text-lg font-semibold mb-5 flex items-center gap-2 text-slate-800";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800">
      {/* Header */}
      <div className="bg-slate-950 text-white px-6 py-5 flex items-center justify-between flex-wrap gap-4 shadow-xl rounded-b-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FiFileText className="text-cyan-300" /> Edit Invoice
          </h1>
          <p className="text-sm text-slate-400">{form.invoice_no} | {form.invoice_date}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/invoices')} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2" aria-label="Go back to invoices">
            <FiArrowLeft size={16} /> Back
          </button>
          <button onClick={handleUpdate} disabled={submitting} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-medium text-sm flex items-center gap-2 disabled:opacity-50">
            {submitting ? <FiLoader className="animate-spin" size={16} /> : <FiSave size={16} />} Update Invoice
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-2 shadow-sm">
          <FiX size={18} /> {errorMsg}
        </div>
      )}

      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Customer & Invoice Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Customer Info */}
          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-blue-700`}><FiUser /> Customer Information</h2>
            <div className="space-y-5">
              <div>
                <label className={labelClass}>Company *</label>
                <select 
                  value={form.company_id} 
                  onChange={e => { setForm(prev => ({ ...prev, company_id: e.target.value ? Number(e.target.value) : '', customer_id: '' })); clearFieldError('company_id'); }} 
                  className={`${inputClass} ${formErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                >
                  <option value="">Select Company</option>
                  {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {formErrors.company_id && <p className="text-xs text-red-500 mt-1">{formErrors.company_id}</p>}
              </div>
              <div>
                <label className={labelClass}>Branch *</label>
                <div className="relative">
                  <select
                    value={form.branch_id}
                    onChange={e => { setForm(prev => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : '' })); clearFieldError('branch_id'); }}
                    className={`${inputClass} ${formErrors.branch_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                    disabled={branchLoading || !form.company_id}
                  >
                    <option value="">Select Branch</option>
                    {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {branchLoading && <div className="absolute right-8 top-3"><FiLoader className="animate-spin text-slate-400" size={16} /></div>}
                </div>
                {branchError && <p className="text-xs text-red-500 mt-1">{branchError}</p>}
                {formErrors.branch_id && <p className="text-xs text-red-500 mt-1">{formErrors.branch_id}</p>}
              </div>
              <div ref={customerDropdownRef}>
                <label className={labelClass}>Customer *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); setHighlightIndex(-1); }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onKeyDown={handleCustomerKeyDown}
                      placeholder="Search customer..."
                      className={inputClass}
                      aria-label="Search customer"
                    />
                    {customerSearch && (
                      <button 
                        onClick={() => { setCustomerSearch(''); setShowCustomerDropdown(false); }}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        aria-label="Clear search"
                      >
                        <FiX size={18} />
                      </button>
                    )}
                    {showCustomerDropdown && customerSearch && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {customersLoading ? (
                          <div className="p-4 text-sm text-slate-500 flex items-center justify-center"><FiLoader className="animate-spin mr-2" /> Loading...</div>
                        ) : customersError ? (
                          <div className="p-4 text-sm text-red-500">Unable to load customers.</div>
                        ) : filteredCustomers.length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">No customers found.</div>
                        ) : (
                          filteredCustomers.map((c, idx) => (
                            <div
                              key={c.id}
                              className={`px-4 py-2.5 cursor-pointer text-sm flex items-center justify-between ${idx === highlightIndex ? 'bg-blue-50' : 'hover:bg-blue-50'}`}
                              onMouseEnter={() => setHighlightIndex(idx)}
                              onClick={() => { setForm(prev => ({ ...prev, customer_id: c.id })); setCustomerSearch(''); setShowCustomerDropdown(false); }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-800 truncate">{c.name}</div>
                                <div className="text-xs text-slate-500 truncate">
                                  {c.gstin && <span className="mr-2">GST: {c.gstin}</span>}
                                  {c.contact_no && <span className="mr-2">📞 {c.contact_no}</span>}
                                  {c.type && <span className="uppercase">{c.type}</span>}
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
                    onClick={openCustomerOffcanvas}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-blue-600 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {formErrors.customer_id && <p className="text-xs text-red-500 mt-1">{formErrors.customer_id}</p>}
                {form.customer_id && customers?.find(c => c.id === Number(form.customer_id)) && (
                  <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
                    <FiCheckCircle size={14} /> Selected: {customers.find(c => c.id === Number(form.customer_id))!.name}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>M/S.</label>
                <input type="text" value={form.customer_name} onChange={e => setForm(prev => ({ ...prev, customer_name: e.target.value }))} className={inputClass} />
              </div>

              {/* Billing Address */}
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold mb-3 text-slate-700">Billing Address</h3>
                <textarea rows={2} value={form.billing_street} onChange={e => setForm(prev => ({ ...prev, billing_street: e.target.value }))} className={inputClass} placeholder="Street Address" />
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>City *</label>
                    <input type="text" value={form.billing_city} onChange={e => setForm(prev => ({ ...prev, billing_city: e.target.value }))} className={inputClass} placeholder="Enter City" />
                  </div>
                  <div>
                    <label className={labelClass}>State</label>
                    <input type="text" value={form.billing_state} onChange={e => setForm(prev => ({ ...prev, billing_state: e.target.value }))} className={inputClass} placeholder="Enter State" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelClass}>Country</label>
                    <input type="text" value={form.billing_country} onChange={e => setForm(prev => ({ ...prev, billing_country: e.target.value }))} className={inputClass} placeholder="India" />
                  </div>
                  <div>
                    <label className={labelClass}>Pincode</label>
                    <input type="text" value={form.billing_pincode} onChange={e => setForm(prev => ({ ...prev, billing_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" />
                  </div>
                </div>
              </div>

              {/* Shipping Address Toggle */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Shipping Address</h3>
                  <button
                    type="button"
                    onClick={toggleShipping}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {showShipping ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                    {showShipping ? 'Hide' : 'Add'}
                  </button>
                </div>
                {showShipping && (
                  <div className="mt-3">
                    <textarea rows={2} value={form.shipping_street} onChange={e => setForm(prev => ({ ...prev, shipping_street: e.target.value }))} className={inputClass} placeholder="Street Address" />
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={labelClass}>City</label>
                        <input type="text" value={form.shipping_city} onChange={e => setForm(prev => ({ ...prev, shipping_city: e.target.value }))} className={inputClass} placeholder="Enter City" />
                      </div>
                      <div>
                        <label className={labelClass}>State</label>
                        <input type="text" value={form.shipping_state} onChange={e => setForm(prev => ({ ...prev, shipping_state: e.target.value }))} className={inputClass} placeholder="Enter State" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className={labelClass}>Country</label>
                        <input type="text" value={form.shipping_country} onChange={e => setForm(prev => ({ ...prev, shipping_country: e.target.value }))} className={inputClass} placeholder="India" />
                      </div>
                      <div>
                        <label className={labelClass}>Pincode</label>
                        <input type="text" value={form.shipping_pincode} onChange={e => setForm(prev => ({ ...prev, shipping_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            
              <div>
                <label className={labelClass}>GSTIN / PAN</label>
                <input type="text" value={form.gstin_pan} onChange={e => setForm(prev => ({ ...prev, gstin_pan: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Right: Invoice Details */}
          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-indigo-700`}><FiFileText /> Invoice Details</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Invoice Type</label>
                  <select value={form.invoice_type} onChange={e => setForm(prev => ({ ...prev, invoice_type: e.target.value as any }))} className={inputClass}>
                    <option value="tax_invoice">Tax Invoice</option>
                    <option value="retail_invoice">Retail Invoice</option>
                    <option value="export_invoice">Export Invoice</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Invoice No. *</label>
                  <input 
                    type="text" 
                    value={form.invoice_no} 
                    onChange={e => { setForm(prev => ({ ...prev, invoice_no: e.target.value })); clearFieldError('invoice_no'); }} 
                    className={`${inputClass} ${formErrors.invoice_no ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                  />
                  {formErrors.invoice_no && <p className="text-xs text-red-500 mt-1">{formErrors.invoice_no}</p>}
                </div>
                <div>
                  <label className={labelClass}>Invoice Date *</label>
                  <input type="date" value={form.invoice_date} onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>PO Number</label>
                <input type="text" value={form.po_no} onChange={e => setForm(prev => ({ ...prev, po_no: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>PO Date</label>
                <input type="date" value={form.po_date} onChange={e => setForm(prev => ({ ...prev, po_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Payment Terms</label>
                <input type="text" value={form.payment_term} onChange={e => setForm(prev => ({ ...prev, payment_term: e.target.value }))} className={inputClass} placeholder="e.g., Net 30" />
              </div>
              <div>
                <label className={labelClass}>E-Way Bill</label>
                <input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} />
              </div>
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
                          <span className="text-slate-600 font-medium ml-3">₹{formatCurrency(p.sale_price ?? p.price)}</span>
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
                        onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); }} 
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
                        onChange={e => { updateItem(idx, 'price', Number(e.target.value)); }} 
                        className={`w-20 bg-transparent border-0 focus:ring-0 text-right p-1 ${item.price < 0 ? 'text-red-500' : ''}`}
                      />
                      {item.price < 0 && <div className="text-xs text-red-500 text-right">Invalid</div>}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount'); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value="percent">%</option>
                          <option value="amount">₹</option>
                        </select>
                        {item.discount_type === 'percent' ? (
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={item.discount_percent} 
                            onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); }} 
                            className={`w-14 bg-transparent border-0 focus:ring-0 text-center p-1 ${item.discount_percent < 0 ? 'text-red-500' : ''}`}
                          />
                        ) : (
                          <input 
                            type="number" 
                            min="0" 
                            step="0.01" 
                            value={item.discount_amount} 
                            onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); }} 
                            className={`w-16 bg-transparent border-0 focus:ring-0 text-center p-1 ${item.discount_amount < 0 || item.discount_amount > item.qty * item.price ? 'text-red-500' : ''}`}
                          />
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                        <option value={-1}>Custom</option>
                      </select>
                      {item.gst_slab === -1 && (
                        <input type="number" step="0.01" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) updateItem(idx, 'gst_slab', val); }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); }} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        IGST
                      </label>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{formatCurrency(item.total)}</td>
                    <td className="py-2 px-3">
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 transition-colors" aria-label="Remove item">
                        <FiTrash2 size={16} />
                      </button>
                    </td>
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
                  <div><label className="text-xs text-slate-500">Qty</label><input type="number" min="1" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className={`w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs ${item.qty <= 0 ? 'border-red-400' : ''}`} /></div>
                  <div><label className="text-xs text-slate-500">Unit</label><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">Price</label><input type="number" min="0" step="0.01" value={item.price} onChange={e => updateItem(idx, 'price', Number(e.target.value))} className={`w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs ${item.price < 0 ? 'border-red-400' : ''}`} /></div>
                  <div><label className="text-xs text-slate-500">Disc Type</label><select value={item.discount_type} onChange={e => updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount')} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"><option value="percent">%</option><option value="amount">₹</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">Discount %</label><input type="number" min="0" value={item.discount_percent} onChange={e => updateItem(idx, 'discount_percent', Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                  <div><label className="text-xs text-slate-500">Disc Amount</label><input type="number" min="0" step="0.01" value={item.discount_amount} onChange={e => updateItem(idx, 'discount_amount', Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-slate-500">GST Slab</label><select value={item.gst_slab} onChange={e => updateItem(idx, 'gst_slab', Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) updateItem(idx, 'gst_slab', val); }} className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs mt-1" />}</div>
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 flex items-center gap-1"><input type="checkbox" checked={item.is_inter_state} onChange={e => updateItem(idx, 'is_inter_state', e.target.checked)} className="rounded border-slate-300" />IGST</label></div>
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
              <div>
                <label className={labelClass}>Bank</label>
                <select value={form.bank_id} onChange={e => setForm(prev => ({ ...prev, bank_id: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}>
                  <option value="">Select Bank</option>
                  {banks?.map(b => <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Terms & Conditions</label>
                <input type="text" value={form.terms_title} onChange={e => setForm(prev => ({ ...prev, terms_title: e.target.value }))} className={inputClass} />
                <textarea rows={4} value={form.terms_detail} onChange={e => setForm(prev => ({ ...prev, terms_detail: e.target.value }))} className={`${inputClass} mt-2`} />
              </div>
              <div>
                <label className={labelClass}>Document Note</label>
                <textarea rows={2} value={form.document_note} onChange={e => setForm(prev => ({ ...prev, document_note: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Internal Note</label>
                <textarea rows={2} value={form.internal_note} onChange={e => setForm(prev => ({ ...prev, internal_note: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{formatCurrency(summary.itemSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-red-500">-₹{formatCurrency(summary.itemDiscountTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxable Amount</span><span>₹{formatCurrency(summary.itemTaxableTotal)}</span></div>
              {!items.every(i => i.is_inter_state) && (
                <>
                  <div className="flex justify-between"><span className="text-slate-500">CGST</span><span>₹{formatCurrency(summary.cgstTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">SGST</span><span>₹{formatCurrency(summary.sgstTotal)}</span></div>
                </>
              )}
              {items.some(i => i.is_inter_state) && (
                <div className="flex justify-between"><span className="text-slate-500">IGST</span><span>₹{formatCurrency(summary.igstTotal)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Additional Charges</span><span>₹{formatCurrency(summary.additionalChargesTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Packing Charges</span><span>₹{formatCurrency(form.packing_charges)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TCS</span><span>₹{formatCurrency(summary.tcsAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Round Off</span><span>{summary.roundOff >= 0 ? '+' : ''}{formatCurrency(summary.roundOff)}</span></div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800">
                <span>Grand Total</span>
                <span>₹{formatCurrency(summary.grandTotal)}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{totalInWords}</div>
            </div>

            {/* Payment Section */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Payments</h3>
                <button onClick={addPayment} className="text-blue-600 text-xs flex items-center gap-1 hover:underline" aria-label="Add payment">
                  <FiPlus size={14} /> Add Payment
                </button>
              </div>
              {form.payments.length === 0 && <p className="text-xs text-slate-400">No payments recorded.</p>}
              <div className="space-y-3">
                {form.payments.map((pay, idx) => (
                  <div key={pay.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-semibold text-slate-500">Payment #{idx + 1}</span>
                      <button onClick={() => removePayment(pay.id)} className="text-red-400 hover:text-red-600" aria-label="Remove payment">
                        <FiTrash2 size={14} />
                      </button>
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
                <span>₹{formatCurrency(summary.totalPaid)}</span>
              </div>
              <div className="flex justify-between mt-1 text-sm font-medium">
                <span className="text-slate-600">Balance Due</span>
                <span className={summary.balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{formatCurrency(summary.balanceDue)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 bg-white/80 backdrop-blur-md border-t border-slate-200 shadow-2xl p-4 flex flex-wrap justify-end gap-3 z-30">
        <button onClick={() => navigate('/invoices')} className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm hover:bg-slate-50 transition-colors">Cancel</button>
        <button onClick={handleUpdate} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 text-white hover:from-slate-900 hover:to-black text-sm flex items-center gap-2 shadow-lg shadow-slate-400/30 transition-all disabled:opacity-50">
          {submitting ? <FiLoader className="animate-spin" size={16} /> : <FiSave size={16} />} Update Invoice
        </button>
      </div>

      {/* Add Customer Offcanvas */}
      {showCustomerOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showCustomerOffcanvas}
            title="Add Customer"
            onClose={() => setShowCustomerOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowCustomerOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50 transition-colors" disabled={customerSubmitting}>Close</button>
                <button onClick={createCustomer} disabled={customerSubmitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {customerSubmitting ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Customer / Vendor Detail</legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className={labelClass}>Type</label>
                    <select value={newCustomer.type} onChange={e => setNewCustomer(prev => ({ ...prev, type: e.target.value }))} className={inputClass}>
                      <option value="customer">Customer</option>
                      <option value="vendor">Vendor</option>
                      <option value="dealer">Dealer</option>
                      <option value="distributor">Distributor</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Company *</label>
                      <select value={newCustomer.company_id} onChange={e => setNewCustomer(prev => ({ ...prev, company_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Branch</label>
                      <select value={newCustomer.branch_id} onChange={e => setNewCustomer(prev => ({ ...prev, branch_id: e.target.value }))} className={inputClass}>
                        <option value="">None</option>
                        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>GSTIN</label>
                    <div className="flex gap-2">
                      <input type="text" value={newCustomer.gst_number} onChange={e => setNewCustomer(prev => ({ ...prev, gst_number: e.target.value }))} className={inputClass} placeholder="Enter GSTIN" />
                      <button type="button" className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 transition-colors">Auto Fill</button>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Company Name *</label>
                    <input type="text" value={newCustomer.name} onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="Enter Company Name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Contact Person</label><input type="text" value={newCustomer.contact_person} onChange={e => setNewCustomer(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} placeholder="Enter Contact Person" /></div>
                    <div><label className={labelClass}>Contact No</label><input type="text" value={newCustomer.contact_no} onChange={e => setNewCustomer(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} placeholder="Enter Contact No" /></div>
                  </div>
                  <div><label className={labelClass}>Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} className={inputClass} placeholder="Enter Email" /></div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Add Product Offcanvas */}
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
                        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Product Name *</label>
                    <input type="text" value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className={`${inputClass} ${productFormErrors.name ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Steel Rod" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>SKU (auto if blank)</label><input type="text" value={newProduct.sku} onChange={e => setNewProduct(prev => ({ ...prev, sku: e.target.value }))} className={inputClass} placeholder="Auto" /></div>
                    <div><label className={labelClass}>HSN/SAC Code</label><input type="text" value={newProduct.hsn_sac_code} onChange={e => setNewProduct(prev => ({ ...prev, hsn_sac_code: e.target.value }))} className={inputClass} placeholder="e.g., 7308" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className={labelClass}>Unit *</label><input type="text" value={newProduct.unit} onChange={e => setNewProduct(prev => ({ ...prev, unit: e.target.value }))} className={`${inputClass} ${productFormErrors.unit ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Piece, Kg" /></div>
                    <div><label className={labelClass}>Sale Price (₹) *</label><input type="number" step="0.01" value={newProduct.sale_price} onChange={e => setNewProduct(prev => ({ ...prev, sale_price: e.target.value }))} className={`${inputClass} ${productFormErrors.sale_price ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="0.00" /></div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2 px-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Tax & Stock</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div><label className={labelClass}>Tax Rate (%)</label><input type="number" step="0.01" value={newProduct.tax_rate} onChange={e => setNewProduct(prev => ({ ...prev, tax_rate: e.target.value }))} className={inputClass} /></div>
                  <div><label className={labelClass}>Stock Quantity</label><input type="number" value={newProduct.stock_quantity} onChange={e => setNewProduct(prev => ({ ...prev, stock_quantity: e.target.value }))} className={inputClass} /></div>
                  <div><label className={labelClass}>Purchase Price (₹)</label><input type="number" step="0.01" value={newProduct.purchase_price} onChange={e => setNewProduct(prev => ({ ...prev, purchase_price: e.target.value }))} className={inputClass} /></div>
                  <div><label className={labelClass}>Reorder Level</label><input type="number" value={newProduct.reorder_level} onChange={e => setNewProduct(prev => ({ ...prev, reorder_level: e.target.value }))} className={inputClass} /></div>
                </div>
              </fieldset>

              <div>
                <label className={labelClass}>Description</label>
                <textarea rows={2} value={newProduct.description} onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))} className={inputClass} placeholder="Optional description" />
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}