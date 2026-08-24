// src/pages/CreateInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiPrinter, FiCreditCard, FiGlobe, FiLoader, FiPackage, FiUsers
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
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
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string;
  price: number; sale_price?: number; tax_rate?: number; igst_rate?: number;
  stock_quantity?: number; unit?: string; sku?: string;
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
}

// Extended customer creation interface (matching CustomersPage)
interface CustomerFormData {
  name: string;
  type: 'customer' | 'dealer' | 'distributor';
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
  outstanding_amount: number | string;
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

  const totalPaid = form.payments.reduce((s, p) => s + (p.amount || 0), 0);

  return {
    itemSubtotal,
    itemDiscountTotal,
    totalTax,
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

// ── API Cache hook ──
const cache = new Map<string, { data: any; timestamp: number }>();
function extractArray<T>(res: any): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res?.data && Array.isArray(res.data)) return res.data as T[];
  if (res?.data && typeof res.data === 'object' && Array.isArray(res.data.data)) return res.data.data as T[];
  if (res?.results && Array.isArray(res.results)) return res.results as T[];
  return [];
}
function useApiCache<T>(key: string, fetcher: () => Promise<T[]>, ttlMs = 300_000) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) { setData(entry.data); setLoading(false); return; }
    }
    setLoading(true); setError(null);
    try {
      const res = await fetcher();
      const result = extractArray<T>(res);
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [key, fetcher, ttlMs]);
  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

// ── Main Component ──
export function CreateInvoicePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const getProducts = useCallback(async () => {
    return await apiClient.getAllProducts();
  }, []);

  const getCompanies = useCallback(async () => {
    return await apiClient.getCompanies();
  }, []);
  const getCustomers = useCallback(async () => {
    const res = await apiClient.getAllCustomers();
    return res;
  }, []);
  const getBanks = useCallback(async () => {
    try { return await apiClient.request('GET', '/banks'); } catch { return []; }
  }, []);
  const getCustomerGroups = useCallback(async () => {
    try { return await apiClient.getCustomerGroups(); } catch { return []; }
  }, []);

  const { data: companies } = useApiCache<Company>('companies', getCompanies);
  const { data: customers, refresh: refreshCustomers } = useApiCache<Customer>('customers', getCustomers);
  const { data: products, refresh: refreshProducts } = useApiCache<Product>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount>('banks', getBanks);
  const { data: customerGroups, refresh: refreshGroups } = useApiCache<any>('customerGroups', getCustomerGroups);

  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);

  const generateInvoicePlaceholder = useCallback(() => {
    const y = new Date().getFullYear();
    return `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
  }, []);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
    invoice_no: generateInvoicePlaceholder(),
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
  });

  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // ── Customer creation offcanvas state (comprehensive) ──
  const [showCustomerOffcanvas, setShowCustomerOffcanvas] = useState(false);
  const [newCustomer, setNewCustomer] = useState<CustomerFormData>({
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
  const [customerFormErrors, setCustomerFormErrors] = useState<Record<string, boolean>>({});
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);
  const [lookingUpGst, setLookingUpGst] = useState(false);

  // GST lookup
  const lookupGst = useCallback(async (gstin: string) => {
    if (!gstin || gstin.length < 10) return null;
    setLookingUpGst(true);
    try {
      const result = await apiClient.lookupGst(gstin);
      return result;
    } catch {
      return null;
    } finally {
      setLookingUpGst(false);
    }
  }, []);

  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewCustomer(prev => ({ ...prev, gst_number: e.target.value }));
  };

  const handleGstAutoFill = async () => {
    if (!newCustomer.gst_number) return;
    const data = await lookupGst(newCustomer.gst_number);
    if (data) {
      setNewCustomer(prev => ({
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

  // Same as billing toggle
  const handleSameAsBillingToggle = (checked: boolean) => {
    setNewCustomer(prev => ({
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

  // Group creation
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

  // ── Fetch branches when company changes ──
  useEffect(() => {
    if (!form.company_id) {
      setAvailableBranches([]);
      setForm(prev => ({ ...prev, branch_id: '' }));
      return;
    }
    setBranchLoading(true);
    apiClient.getBranchesByCompany(Number(form.company_id))
      .then(res => {
        const branchList = Array.isArray(res) ? res : (res?.data ?? []);
        setAvailableBranches(branchList);
        setForm(prev => ({
          ...prev,
          branch_id: branchList.length ? branchList[0].id : ''
        }));
      })
      .catch(() => {
        setAvailableBranches([]);
        setForm(prev => ({ ...prev, branch_id: '' }));
      })
      .finally(() => setBranchLoading(false));
  }, [form.company_id]);

  // Auto-set company/branch in product offcanvas
  const openProductOffcanvas = () => {
    setNewProduct(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
      branch_id: form.branch_id ? String(form.branch_id) : '',
    }));
    setProductFormErrors({});
    setShowProductOffcanvas(true);
  };

  // Warn when switching company with items
  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCompanyId = e.target.value ? Number(e.target.value) : '';
    if (items.length > 0 && newCompanyId !== form.company_id) {
      if (!window.confirm('Changing company will remove all invoice items. Continue?')) return;
      setItems([]);
    }
    setForm(prev => ({ ...prev, company_id: newCompanyId }));
  };

  // Filtered lists
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const term = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(term) || (c.code && c.code.toLowerCase().includes(term)));
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(term) || (p.hsn_sac_code && p.hsn_sac_code.toLowerCase().includes(term)) || (p.sku && p.sku.toLowerCase().includes(term)));
  }, [products, productSearch]);

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

  // ── Create Customer (comprehensive) ──
  const createCustomer = async () => {
    // Validation
    const errors: Record<string, boolean> = {};
    if (!newCustomer.name.trim()) errors.name = true;
    if (!newCustomer.company_id) errors.company_id = true;
    if (!newCustomer.billing_city.trim()) errors.billing_city = true;
    if (newCustomer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errors.email = true;
    if (newCustomer.contact_no.trim() && !/^\d+$/.test(newCustomer.contact_no.trim())) errors.contact_no = true;
    setCustomerFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Validation', 'Please fix the highlighted required fields.');
      return;
    }

    const { same_as_billing, ...payload } = {
      ...newCustomer,
      company_id: Number(newCustomer.company_id),
      branch_id: newCustomer.branch_id ? Number(newCustomer.branch_id) : null,
      group_id: newCustomer.group_id ? Number(newCustomer.group_id) : null,
      eway_bill_distance: newCustomer.eway_bill_distance ? Number(newCustomer.eway_bill_distance) : null,
      opening_balance: newCustomer.opening_balance ? Number(newCustomer.opening_balance) : 0,
      credit_limit: newCustomer.credit_limit ? Number(newCustomer.credit_limit) : null,
      due_days: newCustomer.due_days ? Number(newCustomer.due_days) : null,
      outstanding_amount: newCustomer.outstanding_amount ? Number(newCustomer.outstanding_amount) : 0,
    };

    setCustomerSubmitting(true);
    try {
      const created = await apiClient.createCustomer(payload);
      showSuccess('Customer created', `${created.name} added.`);
      refreshCustomers();
      setForm(prev => ({ ...prev, customer_id: created.id }));
      setShowCustomerOffcanvas(false);
      // Reset form
      setNewCustomer({
        name: '', type: 'customer', company_type: '', email: '', contact_no: '', contact_person: '',
        gst_number: '', registration_type: '', pan: '',
        billing_street: '', billing_landmark: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
        shipping_street: '', shipping_landmark: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
        eway_bill_distance: '', group_id: '', opening_balance: '', credit_limit: '', due_days: '', outstanding_amount: '',
        fax: '', website: '', note: '', license_no: '', custom_field_1: '', custom_field_2: '', is_active: true,
        company_id: '', branch_id: '', same_as_billing: true,
      });
    } catch (err: any) {
      const errorMsg = err.validationErrors ? Object.values(err.validationErrors).flat().join(', ') : err.message;
      showError('Create failed', errorMsg);
    } finally {
      setCustomerSubmitting(false);
    }
  };

  // ── Generate SKU ──
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

  // ── Product creation state ──
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

  // Create product
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
      const errorMsg = err.validationErrors ? Object.values(err.validationErrors).flat().join(', ') : err.message;
      showError('Product creation failed', errorMsg);
      addAppLog({ module: 'Inventory', action: 'Create', status: 'error', message: errorMsg });
    } finally {
      setProductSubmitting(false);
    }
  };

  // ── Item Management ──
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) { showError('Duplicate', 'Product already in list.'); return; }
    const baseItem = {
      product_id: product.id,
      product_name: product.name,
      hsn_sac_code: product.hsn_sac_code || '',
      qty: 1,
      uom: product.uom || product.unit || 'NOS',
      price: product.sale_price || product.price || 0,
      discount_type: 'percent' as const,
      discount_percent: 0,
      discount_amount: 0,
      gst_slab: product.igst_rate || product.tax_rate || 0,
      is_inter_state: true,
    };
    const calculatedItem = calculateItem(baseItem);
    setItems(prev => [...prev, calculatedItem]);
    setProductSearch('');
  }, [items, showError]);

  const removeItem = useCallback((index: number) => setItems(prev => prev.filter((_, i) => i !== index)), []);

  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      updated[index] = calculateItem(item);
      return updated;
    });
  }, []);

  // ── Additional Charges ──
  const addAdditionalCharge = () => setForm(prev => ({ ...prev, additional_charges: [...prev.additional_charges, { id: Date.now().toString(), label: '', amount: 0 }] }));
  const updateAdditionalCharge = (id: string, field: 'label' | 'amount', value: any) => setForm(prev => ({ ...prev, additional_charges: prev.additional_charges.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  const removeAdditionalCharge = (id: string) => setForm(prev => ({ ...prev, additional_charges: prev.additional_charges.filter(c => c.id !== id) }));

  // ── Payment Management ──
  const addPayment = () => {
    const newPayment: PaymentEntry = {
      id: Date.now().toString(),
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
    setForm(prev => ({ ...prev, payments: prev.payments.filter(p => p.id !== id) }));
  };

  // ── Derived summary ──
  const summary = useMemo(() => calculateSummary(items, form), [items, form]);
  const totalInWords = useMemo(() => numberToWordsINR(summary.grandTotal), [summary.grandTotal]);

  // ── Handlers ──
  const validate = () => {
    if (!form.company_id) { setErrorMsg('Select a company.'); return false; }
    if (!form.branch_id) { setErrorMsg('Select a branch.'); return false; }
    if (!form.customer_id) { setErrorMsg('Select a customer.'); return false; }
    if (!form.invoice_no.trim()) { setErrorMsg('Invoice number is required.'); return false; }
    if (items.length === 0) { setErrorMsg('Add at least one product.'); return false; }
    return true;
  };

  const handleSubmit = useCallback(async (action: 'save' | 'save_print' | 'save_draft' = 'save') => {
    setErrorMsg(null);
    if (action !== 'save_draft' && !validate()) return;

    const invoicePayload = {
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
      status: action === 'save_draft' ? 'draft' : 'issued',
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
      const res = await apiClient.createInvoice(invoicePayload);
      const newInvoice = res.data || res;

      const validPayments = form.payments.filter(p => p.amount > 0);
      if (validPayments.length > 0) {
        const paymentPromises = validPayments.map((payment, idx) =>
          apiClient.request('POST', '/payments', {
            company_id: Number(form.company_id),
            invoice_id: newInvoice.id,
            reference_no: payment.reference_no || `PAY-${newInvoice.id}-${idx + 1}`,
            amount: payment.amount,
            payment_method: payment.payment_method,
            status: 'completed',
            payment_direction: 'inward',
            transaction_date: payment.transaction_date,
            bank_name: payment.bank_name,
            account_number: payment.account_number,
            ledger_reference: payment.reference_no || `PAY-${newInvoice.id}-${idx + 1}`,
            remarks: payment.remarks,
          })
        );
        await Promise.all(paymentPromises);
      }

      showSuccess('Invoice saved', `Invoice ${form.invoice_no} created.${validPayments.length ? ' Payments recorded.' : ''}`);
      addAppLog({ module: 'Invoices', action: 'Create', status: 'success', message: form.invoice_no });
      if (action === 'save_print') navigate(`/invoices/${newInvoice.id}?print=1`);
      else navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) {
      const errorMsg = err.validationErrors ? Object.values(err.validationErrors).flat().join(', ') : err.message;
      showError('Error', errorMsg);
      setErrorMsg(errorMsg);
    } finally {
      setSubmitting(false);
    }
  }, [form, items, navigate, showSuccess, showError]);

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition bg-white";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {errorMsg && <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2"><FiX size={18} /> {errorMsg}</div>}

      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Customer & Invoice Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Customer Info */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600"><FiUser /> Customer Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Company *</label>
                <select value={form.company_id} onChange={handleCompanyChange} className={inputClass}>
                  <option value="">Select Company</option>
                  {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Branch *</label>
                <div className="relative">
                  <select
                    value={form.branch_id}
                    onChange={e => setForm(prev => ({ ...prev, branch_id: e.target.value ? Number(e.target.value) : '' }))}
                    className={inputClass}
                    disabled={branchLoading || !form.company_id}
                  >
                    <option value="">Select Branch</option>
                    {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  {branchLoading && <div className="absolute right-8 top-2.5"><FiLoader className="animate-spin text-gray-400" size={16} /></div>}
                </div>
                {form.company_id && !branchLoading && availableBranches.length === 0 && (
                  <div className="text-xs text-red-500 mt-1">No branches found for this company.</div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Customer *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="Search customer..."
                      className={inputClass}
                    />
                    {customerSearch && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredCustomers.map(c => (
                          <div
                            key={c.id}
                            className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm"
                            onClick={() => { setForm(prev => ({ ...prev, customer_id: c.id })); setCustomerSearch(''); }}
                          >
                            {c.name} {c.code ? `(${c.code})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowCustomerOffcanvas(true)} className="px-3 py-2 rounded-lg border text-sm text-blue-600 hover:bg-blue-50">Add</button>
                </div>
                {form.customer_id && customers?.find(c => c.id === Number(form.customer_id)) && (
                  <div className="text-xs text-emerald-600 font-medium mt-1">
                    ✓ Selected: {customers.find(c => c.id === Number(form.customer_id))!.name}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">M/S.</label>
                <input type="text" value={form.customer_name} onChange={e => setForm(prev => ({ ...prev, customer_name: e.target.value }))} className={inputClass} />
              </div>

              {/* Billing Address */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-2">Billing Address</h3>
                <textarea rows={2} value={form.billing_street} onChange={e => setForm(prev => ({ ...prev, billing_street: e.target.value }))} className={inputClass} placeholder="Street Address" />
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">City *</label>
                    <input type="text" value={form.billing_city} onChange={e => setForm(prev => ({ ...prev, billing_city: e.target.value }))} className={inputClass} placeholder="Enter City" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">State</label>
                    <input type="text" value={form.billing_state} onChange={e => setForm(prev => ({ ...prev, billing_state: e.target.value }))} className={inputClass} placeholder="Enter State" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Country</label>
                    <input type="text" value={form.billing_country} onChange={e => setForm(prev => ({ ...prev, billing_country: e.target.value }))} className={inputClass} placeholder="India" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Pincode</label>
                    <input type="text" value={form.billing_pincode} onChange={e => setForm(prev => ({ ...prev, billing_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" />
                  </div>
                </div>
              </div>

              {/* Shipping Address */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-2">Shipping Address</h3>
                <textarea rows={2} value={form.shipping_street} onChange={e => setForm(prev => ({ ...prev, shipping_street: e.target.value }))} className={inputClass} placeholder="Street Address" />
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">City</label>
                    <input type="text" value={form.shipping_city} onChange={e => setForm(prev => ({ ...prev, shipping_city: e.target.value }))} className={inputClass} placeholder="Enter City" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">State</label>
                    <input type="text" value={form.shipping_state} onChange={e => setForm(prev => ({ ...prev, shipping_state: e.target.value }))} className={inputClass} placeholder="Enter State" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-medium mb-1">Country</label>
                    <input type="text" value={form.shipping_country} onChange={e => setForm(prev => ({ ...prev, shipping_country: e.target.value }))} className={inputClass} placeholder="India" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Pincode</label>
                    <input type="text" value={form.shipping_pincode} onChange={e => setForm(prev => ({ ...prev, shipping_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Contact Person</label>
                  <input type="text" value={form.contact_person} onChange={e => setForm(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Contact No</label>
                  <input type="text" value={form.contact_no} onChange={e => setForm(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">GSTIN / PAN</label>
                <input type="text" value={form.gstin_pan} onChange={e => setForm(prev => ({ ...prev, gstin_pan: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Right: Invoice Details */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-600"><FiFileText /> Invoice Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Invoice Type</label>
                  <select value={form.invoice_type} onChange={e => setForm(prev => ({ ...prev, invoice_type: e.target.value as any }))} className={inputClass}>
                    <option value="tax_invoice">Tax Invoice</option>
                    <option value="retail_invoice">Retail Invoice</option>
                    <option value="export_invoice">Export Invoice</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Invoice No. *</label>
                  <input type="text" value={form.invoice_no} onChange={e => setForm(prev => ({ ...prev, invoice_no: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Invoice Date *</label>
                  <input type="date" value={form.invoice_date} onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PO Number</label>
                <input type="text" value={form.po_no} onChange={e => setForm(prev => ({ ...prev, po_no: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PO Date</label>
                <input type="date" value={form.po_date} onChange={e => setForm(prev => ({ ...prev, po_date: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Payment Terms</label>
                <input type="text" value={form.payment_term} onChange={e => setForm(prev => ({ ...prev, payment_term: e.target.value }))} className={inputClass} placeholder="e.g., Net 30" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-Way Bill</label>
                <input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* Items Section */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b">
            <div className="relative w-full flex gap-2">
              <div className="relative flex-1">
                <FiSearch className="absolute left-4 top-3.5 text-gray-400 z-10" size={18} />
                <input
                  type="text"
                  placeholder="Search product by name, HSN or SKU and press Enter to add..."
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && productSearch.trim() && filteredProducts.length > 0) addItem(filteredProducts[0]); }}
                  className="w-full pl-12 pr-4 py-3 rounded-xl border-0 bg-slate-50 text-sm focus:ring-2 focus:ring-blue-200 focus:bg-white outline-none transition"
                />
                {productSearch && <button className="absolute right-3 top-3 text-gray-400 hover:text-gray-600" onClick={() => setProductSearch('')}><FiX size={18} /></button>}
                {productSearch && filteredProducts.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <div
                        key={p.id}
                        className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0"
                        onClick={() => addItem(p)}
                      >
                        <div>
                          <span className="font-medium text-slate-700">{p.name}</span>
                          {p.hsn_sac_code && <span className="ml-2 text-xs text-gray-400">HSN: {p.hsn_sac_code}</span>}
                        </div>
                        <span className="text-gray-600 font-medium">₹{p.sale_price || p.price}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={openProductOffcanvas}
                className="px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-sm font-medium flex items-center gap-1 whitespace-nowrap"
              >
                <FiPlus size={16} /> Add Product
              </button>
            </div>
          </div>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="py-3 px-3">Item</th>
                  <th className="py-3 px-3 text-center">Qty</th>
                  <th className="py-3 px-3 text-center">Unit</th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-3 text-center">Disc Type</th>
                  <th className="py-3 px-3 text-center">Discount</th>
                  <th className="py-3 px-3 text-center">GST Slab</th>
                  <th className="py-3 px-3 text-center">Inter</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-gray-400">
                      <FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.
                    </td>
                  </tr>
                ) : items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                    <td className="py-2 px-3">
                      <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm p-1" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); }} className="w-16 bg-transparent border-0 focus:ring-0 text-center p-1" />
                      {products?.find(p => p.id === item.product_id)?.stock_quantity != null && (
                        <div className="text-xs text-gray-400 text-center -mt-0.5">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); }} className="w-20 bg-transparent border-0 focus:ring-0 text-right p-1" />
                    </td>
                    <td className="py-2 px-3">
                      <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount'); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                        <option value="percent">%</option>
                        <option value="amount">₹</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      {item.discount_type === 'percent' ? (
                        <input type="number" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); }} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                      ) : (
                        <input type="number" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); }} className="w-20 bg-transparent border-0 focus:ring-0 text-center p-1" />
                      )}
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
                        <input
                          type="number"
                          step="0.01"
                          placeholder="%"
                          onChange={e => {
                            const val = Number(e.target.value);
                            if (!isNaN(val)) {
                              updateItem(idx, 'gst_slab', val);
                            }
                          }}
                          className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1"
                        />
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); }} className="rounded border-gray-300" />
                        IGST
                      </label>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{(item.total || 0).toFixed(2)}</td>
                    <td className="py-2 px-3">
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</div>
            ) : items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-gray-400">#{idx + 1}</span>
                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 size={16} /></button>
                </div>
                <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm font-medium" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Qty</label><input type="number" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Unit</label><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Price</label><input type="number" step="0.01" value={item.price} onChange={e => updateItem(idx, 'price', Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Disc Type</label><select value={item.discount_type} onChange={e => updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount')} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value="percent">%</option><option value="amount">₹</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Discount %</label><input type="number" value={item.discount_percent} onChange={e => updateItem(idx, 'discount_percent', Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Disc Amount</label><input type="number" step="0.01" value={item.discount_amount} onChange={e => updateItem(idx, 'discount_amount', Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">GST Slab</label><select value={item.gst_slab} onChange={e => updateItem(idx, 'gst_slab', Number(e.target.value))} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) updateItem(idx, 'gst_slab', val); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs mt-1" />}</div>
                  <div className="flex items-center gap-2"><label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={item.is_inter_state} onChange={e => updateItem(idx, 'is_inter_state', e.target.checked)} className="rounded" />IGST</label></div>
                </div>
                <div className="text-right font-semibold">₹{(item.total || 0).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Invoice Info & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Bank</label>
                <select value={form.bank_id} onChange={e => setForm(prev => ({ ...prev, bank_id: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}>
                  <option value="">Select Bank</option>
                  {banks?.map(b => <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Terms & Conditions</label>
                <input type="text" value={form.terms_title} onChange={e => setForm(prev => ({ ...prev, terms_title: e.target.value }))} className={inputClass} />
                <textarea rows={4} value={form.terms_detail} onChange={e => setForm(prev => ({ ...prev, terms_detail: e.target.value }))} className={`${inputClass} mt-2`} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Document Note</label>
                <textarea rows={2} value={form.document_note} onChange={e => setForm(prev => ({ ...prev, document_note: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Internal Note</label>
                <textarea rows={2} value={form.internal_note} onChange={e => setForm(prev => ({ ...prev, internal_note: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Taxable Amount</span><span className="font-medium">₹{summary.itemTaxableTotal.toFixed(2)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium">General Discount %</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.general_discount_percent}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setForm(prev => ({ ...prev, general_discount_percent: val, general_discount_amount: 0 }));
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Or Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.general_discount_amount}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setForm(prev => ({ ...prev, general_discount_amount: val, general_discount_percent: 0 }));
                    }}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex justify-between"><span>Packing Charges</span><input type="number" step="0.01" value={form.packing_charges} onChange={e => setForm(prev => ({ ...prev, packing_charges: Number(e.target.value) }))} className="w-24 text-right border rounded px-2 py-1" /></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Additional Charges</span>
                  <button onClick={addAdditionalCharge} className="text-blue-600 text-xs flex items-center gap-1"><FiPlus size={14} /> Add</button>
                </div>
                {form.additional_charges.map(c => (
                  <div key={c.id} className="flex gap-2 items-center">
                    <input type="text" placeholder="Charge name" value={c.label} onChange={e => updateAdditionalCharge(c.id, 'label', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs" />
                    <input type="number" placeholder="Amount" value={c.amount} onChange={e => updateAdditionalCharge(c.id, 'amount', Number(e.target.value))} className="w-20 border rounded px-2 py-1 text-xs text-right" />
                    <button onClick={() => removeAdditionalCharge(c.id)} className="text-red-500"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between"><span>Total Taxable</span><span>₹{(summary.itemTaxableTotal - summary.generalDiscountAmount).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>General Discount</span><span className="text-red-500">-₹{summary.generalDiscountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between items-center"><span>TCS %</span><input type="number" step="0.01" value={form.tcs_percent} onChange={e => setForm(prev => ({ ...prev, tcs_percent: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" /></div>
              <div className="flex justify-between"><span>TCS Amount</span><span>₹{summary.tcsAmount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total Tax</span><span>₹{summary.totalTax.toFixed(2)}</span></div>
              <div className="flex justify-between">
                <span>Round Off</span>
                <span className={`font-medium ${summary.roundOff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{summary.roundOff >= 0 ? '+' : ''}{summary.roundOff.toFixed(2)}</span>
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800">
                <span>Grand Total</span>
                <span>₹{summary.grandTotal.toFixed(2)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">{totalInWords}</div>
            </div>

            {/* Payment Section */}
            <div className="mt-6 border-t pt-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Payments</h3>
                <button onClick={addPayment} className="text-blue-600 text-xs flex items-center gap-1"><FiPlus size={14} /> Add Payment</button>
              </div>
              {form.payments.length === 0 && (
                <p className="text-xs text-gray-400">No payments recorded.</p>
              )}
              <div className="space-y-3">
                {form.payments.map((pay, idx) => (
                  <div key={pay.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-semibold text-gray-500">Payment #{idx + 1}</span>
                      <button onClick={() => removePayment(pay.id)} className="text-red-400 hover:text-red-600"><FiTrash2 size={14} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500">Amount</label>
                        <input type="number" step="0.01" value={pay.amount} onChange={e => updatePayment(pay.id, 'amount', Number(e.target.value))} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Method</label>
                        <select value={pay.payment_method} onChange={e => updatePayment(pay.id, 'payment_method', e.target.value as any)} className="w-full border rounded px-2 py-1 text-xs">
                          <option value="UPI">UPI</option>
                          <option value="cash">Cash</option>
                          <option value="cheque">Cheque</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Reference No</label>
                        <input type="text" value={pay.reference_no} onChange={e => updatePayment(pay.id, 'reference_no', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500">Date</label>
                        <input type="date" value={pay.transaction_date} onChange={e => updatePayment(pay.id, 'transaction_date', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                    
                      <div className="col-span-2">
                        <label className="block text-xs text-gray-500">Remarks</label>
                        <input type="text" value={pay.remarks} onChange={e => updatePayment(pay.id, 'remarks', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-3 text-sm font-medium">
                <span>Total Paid</span>
                <span>₹{summary.totalPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between mt-1 text-sm font-medium">
                <span>Balance Due</span>
                <span className={summary.balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}>₹{summary.balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 bg-white border-t shadow-xl p-4 flex flex-wrap justify-end gap-3 z-30">
        <button onClick={() => navigate('/invoices')} className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => handleSubmit('save_draft')} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm">Save Draft</button>
        <button onClick={() => handleSubmit('save')} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-sm flex items-center gap-2"><FiSave size={16} /> Save Invoice</button>
        <button onClick={() => handleSubmit('save_print')} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-cyan-500 text-white hover:bg-cyan-600 text-sm flex items-center gap-2"><FiPrinter size={16} /> Print Invoice</button>
      </div>

      {/* Comprehensive Customer Creation Offcanvas (same as CustomersPage) */}
      {showCustomerOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showCustomerOffcanvas}
            title="Add Customer"
            onClose={() => setShowCustomerOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowCustomerOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={customerSubmitting}>
                  Close
                </button>
                <button onClick={createCustomer} disabled={customerSubmitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
                  {customerSubmitting ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              {/* Customer / Vendor Detail */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Customer / Vendor Detail</legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Type</label>
                    <select value={newCustomer.type} onChange={e => setNewCustomer(prev => ({ ...prev, type: e.target.value as any }))} className={inputClass}>
                      <option value="customer">Customer</option>
                      <option value="dealer">Dealer</option>
                      <option value="distributor">Distributor</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Company *</label>
                      <select
                        value={newCustomer.company_id as string}
                        onChange={e => setNewCustomer(prev => ({ ...prev, company_id: e.target.value }))}
                        className={`${inputClass} ${customerFormErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                      >
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Branch</label>
                      <select
                        value={newCustomer.branch_id as string}
                        onChange={e => setNewCustomer(prev => ({ ...prev, branch_id: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">Select Branch</option>
                        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">GSTIN</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCustomer.gst_number}
                        onChange={handleGstChange}
                        className={inputClass}
                        placeholder="Enter GSTIN"
                      />
                      <button
                        type="button"
                        onClick={handleGstAutoFill}
                        disabled={lookingUpGst || !newCustomer.gst_number}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
                      >
                        {lookingUpGst ? 'Fetching...' : 'Auto Fill'}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Company Name *</label>
                    <input
                      type="text"
                      value={newCustomer.name}
                      onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                      className={`${inputClass} ${customerFormErrors.name ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                      placeholder="Enter Company Name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Person</label>
                      <input type="text" value={newCustomer.contact_person} onChange={e => setNewCustomer(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact No</label>
                      <input
                        type="tel"
                        value={newCustomer.contact_no}
                        onChange={e => { const val = e.target.value.replace(/\D/g, ''); setNewCustomer(prev => ({ ...prev, contact_no: val })); }}
                        className={`${inputClass} ${customerFormErrors.contact_no ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                        placeholder="Enter Contact No"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={newCustomer.email}
                      onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                      className={`${inputClass} ${customerFormErrors.email ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                      placeholder="Enter Email"
                    />
                  </div>
                </div>
              </fieldset>

              {/* Registration Details */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Registration Details</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Registration Type</label>
                    <select value={newCustomer.registration_type} onChange={e => setNewCustomer(prev => ({ ...prev, registration_type: e.target.value }))} className={inputClass}>
                      <option value="">Select</option>
                      <option value="Registered">Registered</option>
                      <option value="Unregistered">Unregistered</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">PAN</label>
                    <input type="text" value={newCustomer.pan} onChange={e => setNewCustomer(prev => ({ ...prev, pan: e.target.value }))} className={inputClass} />
                  </div>
                </div>
              </fieldset>

              {/* Billing Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Billing Address</legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Address</label>
                    <textarea rows={2} value={newCustomer.billing_street} onChange={e => setNewCustomer(prev => ({ ...prev, billing_street: e.target.value }))} className={inputClass} placeholder="Enter Address" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">City *</label>
                      <input
                        type="text"
                        value={newCustomer.billing_city}
                        onChange={e => setNewCustomer(prev => ({ ...prev, billing_city: e.target.value }))}
                        className={`${inputClass} ${customerFormErrors.billing_city ? 'border-red-400 ring-2 ring-red-200' : ''}`}
                        placeholder="Enter City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">State</label>
                      <input type="text" value={newCustomer.billing_state} onChange={e => setNewCustomer(prev => ({ ...prev, billing_state: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Country</label>
                      <input type="text" value={newCustomer.billing_country} onChange={e => setNewCustomer(prev => ({ ...prev, billing_country: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Pincode</label>
                      <input type="text" value={newCustomer.billing_pincode} onChange={e => setNewCustomer(prev => ({ ...prev, billing_pincode: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Shipping Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span> Shipping Address</legend>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={newCustomer.same_as_billing}
                      onChange={(e) => handleSameAsBillingToggle(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">Same as Billing Address</span>
                  </label>
                  {!newCustomer.same_as_billing && (
                    <div className="space-y-4">
                      <textarea rows={2} value={newCustomer.shipping_street} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_street: e.target.value }))} className={inputClass} placeholder="Shipping Address" />
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="City" value={newCustomer.shipping_city} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_city: e.target.value }))} className={inputClass} />
                        <input type="text" placeholder="State" value={newCustomer.shipping_state} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_state: e.target.value }))} className={inputClass} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <input type="text" placeholder="Country" value={newCustomer.shipping_country} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_country: e.target.value }))} className={inputClass} />
                        <input type="text" placeholder="Pincode" value={newCustomer.shipping_pincode} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_pincode: e.target.value }))} className={inputClass} />
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {/* Group & Balance */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Group & Balance</legend>
                <div className="mt-3 space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-sm font-medium mb-1">Group</label>
                      <select value={newCustomer.group_id as string} onChange={e => setNewCustomer(prev => ({ ...prev, group_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Group</option>
                        {customerGroups?.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                    </div>
                    <button type="button" onClick={() => setShowGroupModal(true)} className="mb-0.5 text-blue-600 text-sm hover:underline whitespace-nowrap">+ Add Group</button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Opening Balance</label>
                      <input type="number" value={newCustomer.opening_balance} onChange={e => setNewCustomer(prev => ({ ...prev, opening_balance: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Outstanding Amount</label>
                      <input type="number" value={newCustomer.outstanding_amount} onChange={e => setNewCustomer(prev => ({ ...prev, outstanding_amount: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Credit Limit</label>
                      <input type="number" value={newCustomer.credit_limit} onChange={e => setNewCustomer(prev => ({ ...prev, credit_limit: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Due Days</label>
                      <input type="number" value={newCustomer.due_days} onChange={e => setNewCustomer(prev => ({ ...prev, due_days: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                </div>
              </fieldset>

              {/* Custom Fields */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Custom Fields</legend>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium mb-1">License No.</label><input type="text" value={newCustomer.license_no} onChange={e => setNewCustomer(prev => ({ ...prev, license_no: e.target.value }))} className={inputClass} /></div>
                  <div><label className="block text-sm font-medium mb-1">Custom Field 1</label><input type="text" value={newCustomer.custom_field_1} onChange={e => setNewCustomer(prev => ({ ...prev, custom_field_1: e.target.value }))} className={inputClass} /></div>
                  <div><label className="block text-sm font-medium mb-1">Custom Field 2</label><input type="text" value={newCustomer.custom_field_2} onChange={e => setNewCustomer(prev => ({ ...prev, custom_field_2: e.target.value }))} className={inputClass} /></div>
                </div>
              </fieldset>

              {/* Additional Details */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Additional Details</legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Fax No</label><input type="text" value={newCustomer.fax} onChange={e => setNewCustomer(prev => ({ ...prev, fax: e.target.value }))} className={inputClass} /></div>
                    <div><label className="block text-sm font-medium mb-1">Website</label><input type="text" value={newCustomer.website} onChange={e => setNewCustomer(prev => ({ ...prev, website: e.target.value }))} className={inputClass} /></div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Note</label>
                    <textarea rows={2} value={newCustomer.note} onChange={e => setNewCustomer(prev => ({ ...prev, note: e.target.value }))} className={inputClass} placeholder="Enter Note" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={newCustomer.is_active} onChange={e => setNewCustomer(prev => ({ ...prev, is_active: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <label className="text-sm text-gray-700">Enable – Company will be visible on all documents</label>
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

      {/* Product Offcanvas (unchanged) */}
      {showProductOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showProductOffcanvas}
            title="Add Product"
            onClose={() => setShowProductOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowProductOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={productSubmitting}>
                  Close
                </button>
                <button onClick={createProduct} disabled={productSubmitting} className="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                  {productSubmitting ? 'Creating...' : 'Create Product'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Company *</label>
                      <select value={newProduct.company_id} onChange={e => setNewProduct(prev => ({ ...prev, company_id: e.target.value }))} className={`${inputClass} ${productFormErrors.company_id ? 'border-red-400 ring-2 ring-red-200' : ''}`}>
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Branch</label>
                      <select value={newProduct.branch_id} onChange={e => setNewProduct(prev => ({ ...prev, branch_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Branch</option>
                        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Product Name *</label>
                    <input type="text" value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className={`${inputClass} ${productFormErrors.name ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Steel Rod" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">SKU (leave blank to auto-generate)</label>
                      <input type="text" value={newProduct.sku} onChange={e => setNewProduct(prev => ({ ...prev, sku: e.target.value }))} className={inputClass} placeholder="Auto" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">HSN/SAC Code</label>
                      <input type="text" value={newProduct.hsn_sac_code} onChange={e => setNewProduct(prev => ({ ...prev, hsn_sac_code: e.target.value }))} className={inputClass} placeholder="e.g., 7308" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Unit *</label>
                      <input type="text" value={newProduct.unit} onChange={e => setNewProduct(prev => ({ ...prev, unit: e.target.value }))} className={`${inputClass} ${productFormErrors.unit ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="e.g., Piece, Kg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Sale Price (₹) *</label>
                      <input type="number" step="0.01" value={newProduct.sale_price} onChange={e => setNewProduct(prev => ({ ...prev, sale_price: e.target.value }))} className={`${inputClass} ${productFormErrors.sale_price ? 'border-red-400 ring-2 ring-red-200' : ''}`} placeholder="0.00" />
                    </div>
                  </div>
                </div>
              </fieldset>
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Tax & Stock</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tax Rate (%)</label>
                    <input type="number" step="0.01" value={newProduct.tax_rate} onChange={e => setNewProduct(prev => ({ ...prev, tax_rate: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Stock Quantity</label>
                    <input type="number" value={newProduct.stock_quantity} onChange={e => setNewProduct(prev => ({ ...prev, stock_quantity: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Purchase Price (₹)</label>
                    <input type="number" step="0.01" value={newProduct.purchase_price} onChange={e => setNewProduct(prev => ({ ...prev, purchase_price: e.target.value }))} className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Reorder Level</label>
                    <input type="number" value={newProduct.reorder_level} onChange={e => setNewProduct(prev => ({ ...prev, reorder_level: e.target.value }))} className={inputClass} />
                  </div>
                </div>
              </fieldset>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
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
      `}</style>
    </div>
  );
}