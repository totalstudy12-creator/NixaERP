import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import type { KeyboardEvent } from 'react';
import {
  FiPlus, FiTrash2, FiSearch, FiFileText, FiUser, FiBox, FiX, FiPrinter,
  FiRefreshCw, FiLoader, FiChevronRight, FiSave, FiAlertCircle, FiCheckCircle
} from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas }))
);

type Id = number | '';
type DiscountType = 'percent' | 'amount';
type ApplyType = 'before_tax' | 'after_tax';
type PaymentDirection = 'inward' | 'outward';
type PaymentMethod = 'UPI' | 'cash' | 'cheque' | 'bank_transfer' | 'other';

interface Company { id: number; name: string; state?: string; billing_state?: string; }
interface Supplier {
  id: number; name: string; code?: string; company_id?: number;
  contact_person?: string; contact_no?: string; email?: string; phone?: string;
  gst_number?: string; pan?: string; billing_street?: string; billing_city?: string;
  billing_state?: string; billing_country?: string; billing_pincode?: string;
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string; unit?: string;
  purchase_price?: number | string; sale_price?: number | string; tax_rate?: number | string;
  igst_rate?: number | string; stock_quantity?: number | string; sku?: string; barcode?: string;
}
interface BankAccount { id: number; bank_name: string; account_no: string; }

interface PurchaseItem {
  product_id: number;
  product_name: string;
  hsn_sac_code: string;
  qty: number;
  uom: string;
  price: number;
  discount_type: DiscountType;
  discount_percent: number;
  discount_amount: number;
  gst_slab: number;
  custom_gst_rate: number;
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
  payment_method: PaymentMethod;
  reference_no: string;
  transaction_date: string;
  bank_name: string;
  account_number: string;
  remarks: string;
  payment_direction: PaymentDirection;
}

interface PurchaseFormData {
  company_id: Id;
  supplier_id: Id;
  supplier_name: string;
  supplier_address: string;
  contact_person: string;
  phone_no: string;
  gstin_pan: string;
  reverse_charge: boolean;
  ship_to: string;
  place_of_supply: string;
  invoice_type: 'purchase_invoice' | 'purchase_bill';
  invoice_no: string;
  invoice_date: string;
  challan_no: string;
  challan_date: string;
  po_no: string;
  po_date: string;
  lr_no: string;
  eway_no: string;
  delivery_mode: string;
  payment_type: 'credit' | 'cash' | 'cheque' | 'online' | 'bank_transfer';
  payment_term: string;
  due_date: string;
  bank_id: Id;
  packing_charges: number;
  general_discount_percent: number;
  general_discount_amount: number;
  tcs_percent: number;
  round_off: number;
  terms_title: string;
  terms_detail: string;
  document_note: string;
  additional_charges: AdditionalCharge[];
  internal_note: string;
  billing_street: string;
  billing_city: string;
  billing_state: string;
  billing_country: string;
  billing_pincode: string;
  shipping_street: string;
  shipping_city: string;
  shipping_state: string;
  shipping_country: string;
  shipping_pincode: string;
  territory: string;
  zone: string;
  status: string;
  credit_limit: number;
  outstanding_amount: number;
  wallet_balance: number;
  commission_rate: number;
  kyc_status: string;
  opening_balance: number;
  due_days: number;
  fax: string;
  website: string;
  license_no: string;
  custom_field_1: string;
  custom_field_2: string;
  notes: string;
  email: string;
  payments: PaymentEntry[];
}

const today = () => new Date().toISOString().slice(0, 10);
const isDebugEnabled = () => import.meta.env.DEV || localStorage.getItem('nixaerp:debug') === '1';
const debug = (event: string, data?: unknown) => {
  if (!isDebugEnabled()) return;
  console.debug(`[NIXA ERP][PurchaseInvoice] ${event}`, data ?? '');
};

const normalizeNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const nonNegative = (value: unknown) => Math.max(0, normalizeNumber(value));
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const formatCurrency = (value: unknown) => nonNegative(value).toFixed(2);

function unwrapApi<T = any>(response: any, fallback: T): T {
  if (response == null) return fallback;
  if (Array.isArray(response)) return response as T;
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && !Array.isArray(response)) return response.data as T;
  return response as T;
}

function normalizeList<T>(response: any): T[] {
  const value = unwrapApi<any>(response, []);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.results)) return value.results;
  return [];
}

function getUserFriendlyError(error: any, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const responseData = error?.response?.data;
  const validation = responseData?.errors ?? error?.validationErrors;
  if (validation && typeof validation === 'object') {
    const messages = Object.values(validation).flatMap((v: any) => Array.isArray(v) ? v : [v]);
    if (messages.length) return messages.join(', ');
  }
  const message = responseData?.message ?? error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function numberToWordsINR(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const under1000 = (n: number): string => {
    if (n === 0) return '';
    let out = '';
    if (n >= 100) { out += `${units[Math.floor(n / 100)]} Hundred`; n %= 100; if (n) out += ' '; }
    if (n >= 20) { out += tens[Math.floor(n / 10)]; if (n % 10) out += ` ${units[n % 10]}`; }
    else if (n >= 10) out += teens[n - 10];
    else if (n > 0) out += units[n];
    return out;
  };
  let cents = Math.max(0, Math.round(normalizeNumber(amount) * 100));
  const paise = cents % 100;
  let rupees = Math.floor(cents / 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000); rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000); rupees %= 100_000;
  const thousand = Math.floor(rupees / 1_000); rupees %= 1_000;
  if (crore) parts.push(`${under1000(crore)} Crore`);
  if (lakh) parts.push(`${under1000(lakh)} Lakh`);
  if (thousand) parts.push(`${under1000(thousand)} Thousand`);
  if (rupees) parts.push(under1000(rupees));
  let result = `${parts.join(' ')} Rupees`;
  if (paise) result += ` and ${under1000(paise)} Paise`;
  return `${result} Only`;
}

const createInitialForm = (): PurchaseFormData => ({
  company_id: '', supplier_id: '', supplier_name: '', supplier_address: '', contact_person: '', phone_no: '', gstin_pan: '',
  reverse_charge: false, ship_to: '', place_of_supply: '', invoice_type: 'purchase_invoice', invoice_no: '', invoice_date: today(),
  challan_no: '', challan_date: '', po_no: '', po_date: '', lr_no: '', eway_no: '', delivery_mode: '', payment_type: 'credit',
  payment_term: '', due_date: '', bank_id: '', packing_charges: 0, general_discount_percent: 0, general_discount_amount: 0,
  tcs_percent: 0, round_off: 0, terms_title: 'Terms and Conditions', terms_detail: '', document_note: '', additional_charges: [],
  internal_note: '', billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
  shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '', territory: '', zone: '',
  status: 'active', credit_limit: 0, outstanding_amount: 0, wallet_balance: 0, commission_rate: 0, kyc_status: 'pending',
  opening_balance: 0, due_days: 0, fax: '', website: '', license_no: '', custom_field_1: '', custom_field_2: '', notes: '', email: '', payments: []
});

const createInitialSupplier = () => ({
  company_id: '', name: '', contact_person: '', contact_no: '', email: '', phone: '', gst_number: '', pan: '',
  billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
  shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
  same_as_billing: true, opening_balance: 0, credit_limit: 0, due_days: 0, notes: ''
});

const createInitialProduct = () => ({
  company_id: '', branch_id: '', name: '', sku: '', hsn_sac_code: '', unit: 'Piece', sale_price: '', purchase_price: '',
  tax_rate: '0', stock_quantity: '0', reorder_level: '0', description: ''
});

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const cacheRef = useRef<Map<string, { data: T; timestamp: number }>>(new Map());
  const requestRef = useRef<Map<string, Promise<T>>>(new Map());
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    const cached = cacheRef.current.get(key);
    if (!skipCache && cached && Date.now() - cached.timestamp < ttlMs) {
      setData(cached.data); setLoading(false); setError(null); return;
    }
    const existing = requestRef.current.get(key);
    const request = existing ?? fetcher();
    if (!existing) requestRef.current.set(key, request);
    setLoading(true); setError(null);
    try {
      const result = await request;
      cacheRef.current.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (e) {
      console.error(`[NIXA ERP] API load failed: ${key}`, e);
      setError(getUserFriendlyError(e, 'Unable to load data. Please try again.'));
    } finally {
      requestRef.current.delete(key);
      setLoading(false);
    }
  }, [fetcher, key, ttlMs]);

  useEffect(() => { void fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

function getEffectiveGst(item: PurchaseItem) {
  return item.gst_slab === -1 ? nonNegative(item.custom_gst_rate) : nonNegative(item.gst_slab);
}

function computeItem(item: PurchaseItem): PurchaseItem {
  const qty = nonNegative(item.qty);
  const price = nonNegative(item.price);
  const base = round2(qty * price);
  const discount = item.discount_type === 'percent'
    ? round2(Math.min(base, base * Math.min(100, nonNegative(item.discount_percent)) / 100))
    : round2(Math.min(base, nonNegative(item.discount_amount)));
  const taxable = round2(Math.max(0, base - discount));
  const slab = getEffectiveGst(item);
  const cgstPercent = item.is_inter_state ? 0 : slab / 2;
  const sgstPercent = item.is_inter_state ? 0 : slab / 2;
  const igstPercent = item.is_inter_state ? slab : 0;
  const cgst = round2(taxable * cgstPercent / 100);
  const sgst = round2(taxable * sgstPercent / 100);
  const igst = round2(taxable * igstPercent / 100);
  return {
    ...item, qty, price, discount_percent: nonNegative(item.discount_percent), discount_amount: discount,
    cgst_percent: cgstPercent, sgst_percent: sgstPercent, igst_percent: igstPercent,
    cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst, total: round2(taxable + cgst + sgst + igst)
  };
}

function makeItem(product: Product): PurchaseItem {
  const tax = nonNegative(product.tax_rate ?? product.igst_rate);
  return computeItem({
    product_id: Number(product.id), product_name: product.name?.trim() || 'Unnamed product', hsn_sac_code: product.hsn_sac_code || '', qty: 1,
    uom: product.uom || product.unit || 'NOS', price: nonNegative(product.purchase_price), discount_type: 'percent', discount_percent: 0,
    discount_amount: 0, gst_slab: [0, 5, 12, 18, 28].includes(tax) ? tax : -1, custom_gst_rate: tax,
    is_inter_state: false, cgst_percent: 0, sgst_percent: 0, igst_percent: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total: 0
  });
}

function htmlEscape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function CreatePurchaseInvoicePage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const [form, setForm] = useState<PurchaseFormData>(createInitialForm);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [autoRoundOff, setAutoRoundOff] = useState(true);
  const [generalDiscountType, setGeneralDiscountType] = useState<DiscountType>('percent');
  const [generalDiscountApplyType, setGeneralDiscountApplyType] = useState<ApplyType>('before_tax');
  const [packingApplyType, setPackingApplyType] = useState<ApplyType>('after_tax');
  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [supplierHighlight, setSupplierHighlight] = useState(-1);
  const [productHighlight, setProductHighlight] = useState(-1);
  const [showSupplierOffcanvas, setShowSupplierOffcanvas] = useState(false);
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);
  const [newSupplier, setNewSupplier] = useState(createInitialSupplier);
  const [showProductOffcanvas, setShowProductOffcanvas] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [newProduct, setNewProduct] = useState(createInitialProduct);
  const [productFormErrors, setProductFormErrors] = useState<Record<string, boolean>>({});

  const supplierDropdownRef = useRef<HTMLDivElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const submittedIdRef = useRef<number | string | null>(null);
  const initialSnapshot = useRef('');

  const getCompanies = useCallback(() => apiClient.getCompanies().then((r: any) => normalizeList<Company>(r)), []);
  const getSuppliers = useCallback(() => apiClient.getSuppliers().then((r: any) => normalizeList<Supplier>(r)), []);
  const getProducts = useCallback(() => apiClient.getAllProducts().then((r: any) => normalizeList<Product>(r)), []);
  const getBanks = useCallback(async () => {
    try { return normalizeList<BankAccount>(await apiClient.request('GET', '/banks')); }
    catch (e) { debug('banks.load.failed', e); return []; }
  }, []);

  const { data: companies, loading: companiesLoading, error: companiesError } = useApiCache<Company[]>('companies', getCompanies);
  const { data: suppliers, loading: suppliersLoading, error: suppliersError, refresh: refreshSuppliers } = useApiCache<Supplier[]>('suppliers', getSuppliers);
  const { data: products, loading: productsLoading, error: productsError, refresh: refreshProducts } = useApiCache<Product[]>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount[]>('banks', getBanks);

  const initialReady = useRef(false);
  useEffect(() => {
    if (!initialReady.current) {
      initialSnapshot.current = JSON.stringify({ form, items, generalDiscountType, generalDiscountApplyType, packingApplyType });
      initialReady.current = true;
    }
  }, [form, items, generalDiscountType, generalDiscountApplyType, packingApplyType]);

  const currentSnapshot = JSON.stringify({ form, items, generalDiscountType, generalDiscountApplyType, packingApplyType });
  const isDirty = initialReady.current && currentSnapshot !== initialSnapshot.current;

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty || submitting || savingDraft) return;
      e.preventDefault(); e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [isDirty, submitting, savingDraft]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(target)) setShowSupplierDropdown(false);
      if (productDropdownRef.current && !productDropdownRef.current.contains(target)) setShowProductDropdown(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const list = Array.isArray(suppliers) ? suppliers.filter(Boolean) : [];
    const companyId = Number(form.company_id || 0);
    const byCompany = companyId ? list.filter((s) => !s.company_id || Number(s.company_id) === companyId) : list;
    const q = supplierSearch.trim().toLowerCase();
    return q ? byCompany.filter((s) => [s.name, s.code, s.gst_number, s.pan, s.phone, s.contact_no].some((v) => String(v || '').toLowerCase().includes(q))) : byCompany;
  }, [suppliers, supplierSearch, form.company_id]);

  const filteredProducts = useMemo(() => {
    const list = Array.isArray(products) ? products.filter(Boolean) : [];
    const q = productSearch.trim().toLowerCase();
    return q ? list.filter((p) => [p.name, p.sku, p.barcode, p.hsn_sac_code].some((v) => String(v || '').toLowerCase().includes(q))) : list;
  }, [products, productSearch]);

  const selectedSupplier = useMemo(() => suppliers?.find((s) => Number(s.id) === Number(form.supplier_id)), [suppliers, form.supplier_id]);
  useEffect(() => {
    if (!selectedSupplier) return;
    setForm((prev) => ({
      ...prev,
      supplier_name: selectedSupplier.name || prev.supplier_name,
      supplier_address: [selectedSupplier.billing_street, selectedSupplier.billing_city, selectedSupplier.billing_state, selectedSupplier.billing_pincode].filter(Boolean).join(', '),
      contact_person: selectedSupplier.contact_person || '',
      phone_no: selectedSupplier.phone || selectedSupplier.contact_no || '',
      gstin_pan: selectedSupplier.gst_number || selectedSupplier.pan || '',
      place_of_supply: selectedSupplier.billing_state || prev.place_of_supply,
      email: selectedSupplier.email || ''
    }));
    setSupplierSearch(selectedSupplier.name || '');
  }, [selectedSupplier]);

  const itemSubtotal = useMemo(() => round2(items.reduce((sum, i) => sum + nonNegative(i.qty) * nonNegative(i.price), 0)), [items]);
  const itemDiscountTotal = useMemo(() => round2(items.reduce((sum, i) => sum + nonNegative(i.discount_amount), 0)), [items]);
  const taxableBeforeBillDiscount = useMemo(() => round2(Math.max(0, itemSubtotal - itemDiscountTotal)), [itemSubtotal, itemDiscountTotal]);
  const itemCgstTotal = useMemo(() => round2(items.reduce((sum, i) => sum + nonNegative(i.cgst_amount), 0)), [items]);
  const itemSgstTotal = useMemo(() => round2(items.reduce((sum, i) => sum + nonNegative(i.sgst_amount), 0)), [items]);
  const itemIgstTotal = useMemo(() => round2(items.reduce((sum, i) => sum + nonNegative(i.igst_amount), 0)), [items]);
  const itemTaxTotal = round2(itemCgstTotal + itemSgstTotal + itemIgstTotal);
  const effectiveTaxRate = taxableBeforeBillDiscount > 0 ? itemTaxTotal / taxableBeforeBillDiscount : 0;
  const generalDiscountAmount = useMemo(() => {
    const raw = generalDiscountType === 'percent'
      ? taxableBeforeBillDiscount * Math.min(100, nonNegative(form.general_discount_percent)) / 100
      : nonNegative(form.general_discount_amount);
    return round2(Math.min(taxableBeforeBillDiscount, raw));
  }, [generalDiscountType, form.general_discount_percent, form.general_discount_amount, taxableBeforeBillDiscount]);
  const discountedTaxable = generalDiscountApplyType === 'before_tax'
    ? round2(Math.max(0, taxableBeforeBillDiscount - generalDiscountAmount))
    : taxableBeforeBillDiscount;
  const taxAfterBillDiscount = useMemo(() => {
    if (generalDiscountApplyType === 'after_tax') return itemTaxTotal;
    if (taxableBeforeBillDiscount <= 0) return 0;
    let remainingDiscount = generalDiscountAmount;
    let tax = 0;
    items.forEach((item) => {
      const base = round2(Math.max(0, nonNegative(item.qty) * nonNegative(item.price) - nonNegative(item.discount_amount)));
      const allocated = round2(base > 0 ? generalDiscountAmount * base / taxableBeforeBillDiscount : 0);
      const adjustedBase = Math.max(0, base - allocated);
      const slab = getEffectiveGst(item);
      tax += item.is_inter_state ? adjustedBase * slab / 100 : adjustedBase * slab / 100;
      remainingDiscount -= allocated;
    });
    tax += remainingDiscount > 0 && discountedTaxable > 0 ? remainingDiscount * effectiveTaxRate : 0;
    return round2(tax);
  }, [generalDiscountApplyType, generalDiscountAmount, itemTaxTotal, taxableBeforeBillDiscount, items, discountedTaxable, effectiveTaxRate]);
  const packingAmount = nonNegative(form.packing_charges);
  const packingTax = packingApplyType === 'before_tax' ? round2(packingAmount * effectiveTaxRate) : 0;
  const additionalChargesTotal = useMemo(() => round2(form.additional_charges.reduce((sum, c) => sum + nonNegative(c.amount), 0)), [form.additional_charges]);
  const totalTaxWithPacking = round2(taxAfterBillDiscount + packingTax);
  const afterTaxGeneralDiscount = generalDiscountApplyType === 'after_tax' ? generalDiscountAmount : 0;
  const totalBeforeTcs = useMemo(() => round2(Math.max(0,
    discountedTaxable + (packingApplyType === 'before_tax' ? packingAmount : 0) +
    totalTaxWithPacking + additionalChargesTotal - afterTaxGeneralDiscount +
    (packingApplyType === 'after_tax' ? packingAmount : 0)
  )), [discountedTaxable, packingApplyType, packingAmount, totalTaxWithPacking, additionalChargesTotal, afterTaxGeneralDiscount]);
  const tcsAmount = round2(totalBeforeTcs * Math.min(100, nonNegative(form.tcs_percent)) / 100);
  const totalBeforeRoundOff = round2(totalBeforeTcs + tcsAmount);

  useEffect(() => {
    if (!autoRoundOff) return;
    const next = round2(Math.round(totalBeforeRoundOff) - totalBeforeRoundOff);
    setForm((prev) => Math.abs(prev.round_off - next) < 0.005 ? prev : { ...prev, round_off: next });
  }, [autoRoundOff, totalBeforeRoundOff]);

  const grandTotal = round2(Math.max(0, totalBeforeRoundOff + normalizeNumber(form.round_off)));
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);
  const totalOutward = useMemo(() => round2(form.payments.reduce((sum, p) => sum + (p.payment_direction === 'outward' ? nonNegative(p.amount) : 0), 0)), [form.payments]);
  const totalInward = useMemo(() => round2(form.payments.reduce((sum, p) => sum + (p.payment_direction === 'inward' ? nonNegative(p.amount) : 0), 0)), [form.payments]);
  const netPaid = round2(totalOutward - totalInward);
  const balanceDue = round2(grandTotal - netPaid);

  const updateItem = useCallback((index: number, patch: Partial<PurchaseItem>) => {
    setItems((prev) => prev.map((item, i) => i === index ? computeItem({ ...item, ...patch }) : item));
  }, []);
  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      if (prev.some((item) => item.product_id === Number(product.id))) {
        showError('Duplicate product', `${product.name} is already added.`);
        return prev;
      }
      return [...prev, makeItem(product)];
    });
    setProductSearch(''); setShowProductDropdown(false); setProductHighlight(-1);
  }, [showError]);
  const removeItem = useCallback((index: number) => setItems((prev) => prev.filter((_, i) => i !== index)), []);

  const clearFieldError = (field: string) => setFormErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  const updateForm = <K extends keyof PurchaseFormData>(field: K, value: PurchaseFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value })); clearFieldError(String(field));
  };

  const validate = (isDraft: boolean) => {
    const errors: Record<string, string> = {};
    if (!form.company_id) errors.company_id = 'Select a company.';
    if (!form.supplier_id) errors.supplier_id = 'Select a supplier.';
    if (!form.invoice_no.trim() && !isDraft) errors.invoice_no = 'Invoice number is required.';
    if (!form.invoice_date) errors.invoice_date = 'Invoice date is required.';
    if (items.length === 0 && !isDraft) errors.items = 'Add at least one product.';
    if (items.some((i) => i.qty <= 0 || i.price < 0)) errors.items = 'Item quantity must be greater than 0 and price cannot be negative.';
    if (items.some((i) => getEffectiveGst(i) > 100)) errors.items = 'GST rate cannot exceed 100%.';
    const paymentNegative = form.payments.some((p) => p.amount < 0);
    if (paymentNegative) errors.payments = 'Payment amounts cannot be negative.';
    if (totalOutward > grandTotal + 0.01) errors.payments = `Outward payments cannot exceed the invoice total of ₹${formatCurrency(grandTotal)}.`;
    setFormErrors(errors);
    debug('validation', errors);
    return Object.keys(errors).length === 0;
  };

  const selectSupplier = (supplier: Supplier) => {
    updateForm('supplier_id', supplier.id);
    setSupplierSearch(supplier.name || ''); setShowSupplierDropdown(false); setSupplierHighlight(-1);
  };

  const createSupplier = async () => {
    if (!newSupplier.company_id || !newSupplier.name.trim()) {
      showError('Validation', 'Company and supplier name are required.'); return;
    }
    setSupplierSubmitting(true);
    try {
      const createdRaw = await apiClient.createSupplier({
        ...newSupplier, company_id: Number(newSupplier.company_id), type: 'supplier', is_active: true
      });
      const created = unwrapApi<Supplier>(createdRaw, {} as Supplier);
      if (!created?.id) throw new Error('Supplier was created but the server did not return its ID.');
      debug('supplier.created', created);
      showSuccess('Supplier created', `${created.name} added.`);
      updateForm('supplier_id', created.id);
      await refreshSuppliers();
      setShowSupplierOffcanvas(false); setNewSupplier(createInitialSupplier());
    } catch (e) {
      const message = getUserFriendlyError(e, 'Supplier creation failed.');
      showError('Create failed', message); debug('supplier.create.failed', e);
      await addAppLog({ module: 'Purchases', action: 'Create Supplier', status: 'error', message });
    } finally { setSupplierSubmitting(false); }
  };

  const createProduct = async () => {
    const errors: Record<string, boolean> = {};
    if (!newProduct.company_id) errors.company_id = true;
    if (!newProduct.name.trim()) errors.name = true;
    if (!newProduct.unit.trim()) errors.unit = true;
    if (newProduct.purchase_price === '' || nonNegative(newProduct.purchase_price) !== normalizeNumber(newProduct.purchase_price) || normalizeNumber(newProduct.purchase_price) < 0) errors.purchase_price = true;
    setProductFormErrors(errors);
    if (Object.keys(errors).length) { showError('Validation', 'Please fill the required product fields.'); return; }

    let sku = newProduct.sku.trim();
    if (!sku) {
      const numbers = (products || []).map((p) => /^FU-(\d+)$/i.exec(p.sku || '')?.[1]).filter(Boolean).map(Number);
      sku = `FU-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(3, '0')}`;
    }
    setProductSubmitting(true);
    try {
      const payload = {
        company_id: Number(newProduct.company_id), branch_id: newProduct.branch_id ? Number(newProduct.branch_id) : null,
        name: newProduct.name.trim(), sku, hsn_sac_code: newProduct.hsn_sac_code.trim(), unit: newProduct.unit.trim(),
        sale_price: nonNegative(newProduct.sale_price), purchase_price: nonNegative(newProduct.purchase_price), tax_rate: Math.min(100, nonNegative(newProduct.tax_rate)),
        stock_quantity: normalizeNumber(newProduct.stock_quantity), reorder_level: normalizeNumber(newProduct.reorder_level), description: newProduct.description.trim(), active: true
      };
      const createdRaw = await apiClient.createProduct(payload);
      const created = unwrapApi<Product>(createdRaw, {} as Product);
      if (!created?.id) throw new Error('Product was created but the server did not return its ID.');
      showSuccess('Product created', `${created.name} added to catalog.`);
      await refreshProducts(); setShowProductOffcanvas(false); setNewProduct(createInitialProduct()); setProductFormErrors({});
      addItem(created);
    } catch (e) {
      const message = getUserFriendlyError(e, 'Product creation failed.');
      showError('Product creation failed', message); debug('product.create.failed', e);
      await addAppLog({ module: 'Inventory', action: 'Create Product', status: 'error', message });
    } finally { setProductSubmitting(false); }
  };

  const createPurchasePayload = (status: 'draft' | 'ordered') => ({
    company_id: Number(form.company_id),
    branch: localStorage.getItem('nixaerp_branch_name') || 'Main Branch',
    supplier_id: Number(form.supplier_id), supplier_name: form.supplier_name.trim(), supplier_address: form.supplier_address.trim(),
    contact_person: form.contact_person.trim(), phone_no: form.phone_no.trim(), gstin: form.gstin_pan.trim(), pan: form.gstin_pan.trim(),
    reverse_charge: Boolean(form.reverse_charge), ship_to: form.ship_to.trim(), place_of_supply: form.place_of_supply.trim(),
    invoice_type: form.invoice_type, purchase_number: form.invoice_no.trim(), purchase_date: form.invoice_date, due_date: form.due_date || null,
    challan_no: form.challan_no.trim() || null, challan_date: form.challan_date || null, po_no: form.po_no.trim() || null, po_date: form.po_date || null,
    lr_no: form.lr_no.trim() || null, eway_no: form.eway_no.trim() || null, delivery_mode: form.delivery_mode.trim() || null,
    payment_type: form.payment_type, payment_term: form.payment_term.trim() || null, bank_id: form.bank_id ? Number(form.bank_id) : null,
    packing_charges: packingAmount, packing_apply_type: packingApplyType,
    general_discount_type: generalDiscountType,
    general_discount_apply_type: generalDiscountApplyType,
    general_discount_percent: generalDiscountType === 'percent' ? nonNegative(form.general_discount_percent) : 0,
    general_discount_amount: generalDiscountType === 'amount' ? generalDiscountAmount : 0,
    tcs_percent: nonNegative(form.tcs_percent), round_off: normalizeNumber(form.round_off),
    terms_title: form.terms_title || null, terms_detail: form.terms_detail || null, document_note: form.document_note || null, internal_note: form.internal_note || null,
    additional_charges: form.additional_charges.filter((c) => c.label.trim() || nonNegative(c.amount) > 0).map((c) => ({ label: c.label.trim(), amount: nonNegative(c.amount) })),
    total_amount: grandTotal, tax_amount: totalTaxWithPacking, discount_amount: round2(itemDiscountTotal + generalDiscountAmount), status,
    items: items.map((i) => ({
      product_id: Number(i.product_id), product_name: i.product_name.trim(), hsn_sac_code: i.hsn_sac_code || '', unit: i.uom || 'NOS', quantity: nonNegative(i.qty),
      purchase_price: nonNegative(i.price), discount_type: i.discount_type, discount_percent: i.discount_type === 'percent' ? nonNegative(i.discount_percent) : 0,
      discount_amount: i.discount_type === 'amount' ? nonNegative(i.discount_amount) : 0, gst_slab: getEffectiveGst(i), is_inter_state: Boolean(i.is_inter_state),
      cgst_percent: i.cgst_percent, sgst_percent: i.sgst_percent, igst_percent: i.igst_percent
    }))
  });

  const printSavedPurchase = useCallback((purchaseId: string | number) => {
    const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=800');
    if (!win) throw new Error('Popup blocked. Allow popups to print the purchase invoice.');
    const rows = items.map((i) => `<tr><td>${htmlEscape(i.product_name)}</td><td>${i.qty}</td><td>${htmlEscape(i.uom)}</td><td>₹${formatCurrency(i.price)}</td><td>₹${formatCurrency(i.discount_amount)}</td><td>${formatCurrency(getEffectiveGst(i))}%</td><td>₹${formatCurrency(i.total)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><title>Purchase ${htmlEscape(form.invoice_no)}</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#222}h1{font-size:20px;margin:0 0 8px}p{margin:4px 0;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:20px;font-size:12px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f5f5f5}.right{text-align:right}.summary{margin-top:20px;margin-left:auto;width:320px}.row{display:flex;justify-content:space-between;padding:4px 0}.grand{font-weight:bold;font-size:16px;border-top:2px solid #222;margin-top:6px;padding-top:8px}</style></head><body><h1>Purchase Invoice</h1><p><b>Invoice:</b> ${htmlEscape(form.invoice_no)} &nbsp; <b>Date:</b> ${htmlEscape(form.invoice_date)}</p><p><b>Supplier:</b> ${htmlEscape(form.supplier_name)} &nbsp; <b>Place:</b> ${htmlEscape(form.place_of_supply)}</p><p><b>Purchase ID:</b> ${htmlEscape(purchaseId)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Price</th><th>Discount</th><th>GST</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div class="row"><span>Subtotal</span><span>₹${formatCurrency(itemSubtotal)}</span></div><div class="row"><span>Discount</span><span>-₹${formatCurrency(itemDiscountTotal + generalDiscountAmount)}</span></div><div class="row"><span>Tax</span><span>₹${formatCurrency(totalTaxWithPacking)}</span></div><div class="row"><span>Other Charges</span><span>₹${formatCurrency(additionalChargesTotal + packingAmount)}</span></div><div class="row"><span>TCS</span><span>₹${formatCurrency(tcsAmount)}</span></div><div class="row"><span>Round Off</span><span>₹${formatCurrency(form.round_off)}</span></div><div class="row grand"><span>Grand Total</span><span>₹${formatCurrency(grandTotal)}</span></div></div><p style="margin-top:24px"><b>Amount in words:</b> ${htmlEscape(totalInWords)}</p><script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
    win.document.close();
  }, [items, form.invoice_no, form.invoice_date, form.supplier_name, form.place_of_supply, itemSubtotal, itemDiscountTotal, generalDiscountAmount, totalTaxWithPacking, additionalChargesTotal, packingAmount, tcsAmount, form.round_off, grandTotal, totalInWords]);

  const handleSubmit = useCallback(async (action: 'save' | 'save_print' | 'save_draft') => {
    if (submitting || savingDraft || submittedIdRef.current) return;
    const isDraft = action === 'save_draft';
    if (!validate(isDraft)) {
      showError('Validation', 'Please correct the highlighted fields.');
      return;
    }
    setErrorMsg(null);
    if (isDraft) setSavingDraft(true); else setSubmitting(true);
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    debug('submit.start', { requestId, action, invoiceNo: form.invoice_no, itemCount: items.length, grandTotal });
    try {
      const payload = createPurchasePayload(isDraft ? 'draft' : 'ordered');
      const response = await apiClient.createPurchaseInvoice(payload);
      const purchase = unwrapApi<any>(response, null);
      const purchaseId = purchase?.id ?? purchase?.purchase?.id ?? purchase?.data?.id;
      if (!purchaseId) throw new Error('Purchase invoice was not returned with a valid ID. The server may not have saved it safely.');
      submittedIdRef.current = purchaseId;
      debug('submit.purchase.created', { requestId, purchaseId, response });

      const validPayments = form.payments.filter((p) => nonNegative(p.amount) > 0);
      const paymentFailures: string[] = [];
      for (let index = 0; index < validPayments.length; index += 1) {
        const payment = validPayments[index];
        try {
          await apiClient.request('POST', '/payments', {
            company_id: Number(form.company_id), invoice_id: purchaseId, reference_no: payment.reference_no.trim() || `PAY-${purchaseId}-${index + 1}`,
            amount: nonNegative(payment.amount), payment_method: payment.payment_method, status: 'completed', payment_direction: payment.payment_direction,
            transaction_date: payment.transaction_date || form.invoice_date, bank_name: payment.bank_name.trim(), account_number: payment.account_number.trim(),
            ledger_reference: payment.reference_no.trim() || `PAY-${purchaseId}-${index + 1}`, remarks: payment.remarks.trim()
          });
        } catch (paymentError) {
          const message = getUserFriendlyError(paymentError, `Payment #${index + 1} failed.`);
          paymentFailures.push(message); debug('submit.payment.failed', { index, error: paymentError });
        }
      }

      await addAppLog({ module: 'Purchases', action: isDraft ? 'Create Draft' : 'Create', status: paymentFailures.length ? 'warning' : 'success', message: `${form.invoice_no || `Purchase #${purchaseId}`} | ID ${purchaseId}${paymentFailures.length ? ` | Payment failures: ${paymentFailures.join('; ')}` : ''}` });
      if (paymentFailures.length) {
        showError('Purchase saved with payment warning', `Invoice ${form.invoice_no || purchaseId} was saved, but ${paymentFailures.length} payment(s) failed. Review payments before treating the invoice as fully paid.`);
      } else {
        showSuccess(isDraft ? 'Draft saved' : 'Purchase created', isDraft ? `Draft ${form.invoice_no || purchaseId} saved.` : `Invoice ${form.invoice_no} created successfully.`);
      }

      if (action === 'save_print') {
        try { printSavedPurchase(purchaseId); } catch (printError) { showError('Print failed', getUserFriendlyError(printError, 'Invoice saved, but the print window could not be opened.')); }
      }
      navigate('/purchases');
    } catch (e) {
      submittedIdRef.current = null;
      const message = getUserFriendlyError(e, 'Purchase invoice could not be saved.');
      setErrorMsg(message); showError('Save failed', message); debug('submit.failed', { requestId, error: e });
      await addAppLog({ module: 'Purchases', action: 'Create', status: 'error', message });
    } finally {
      setSubmitting(false); setSavingDraft(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, items, grandTotal, submitting, savingDraft, generalDiscountType, generalDiscountApplyType, packingApplyType, createPurchasePayload, printSavedPurchase]);

  const openSupplier = () => { setNewSupplier((p) => ({ ...p, company_id: form.company_id ? String(form.company_id) : '' })); setShowSupplierOffcanvas(true); };
  const openProduct = () => { setNewProduct((p) => ({ ...p, company_id: form.company_id ? String(form.company_id) : '' })); setProductFormErrors({}); setShowProductOffcanvas(true); };
  const generateInvoiceNo = () => updateForm('invoice_no', `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`);
  const addCharge = () => setForm((p) => ({ ...p, additional_charges: [...p.additional_charges, { id: `${Date.now()}-${Math.random()}`, label: '', amount: 0 }] }));
  const updateCharge = (id: string, patch: Partial<AdditionalCharge>) => setForm((p) => ({ ...p, additional_charges: p.additional_charges.map((c) => c.id === id ? { ...c, ...patch } : c) }));
  const removeCharge = (id: string) => setForm((p) => ({ ...p, additional_charges: p.additional_charges.filter((c) => c.id !== id) }));
  const addPayment = () => setForm((p) => ({ ...p, payments: [...p.payments, { id: `${Date.now()}-${Math.random()}`, amount: 0, payment_method: 'bank_transfer', reference_no: '', transaction_date: today(), bank_name: '', account_number: '', remarks: '', payment_direction: 'outward' }] }));
  const updatePayment = (id: string, patch: Partial<PaymentEntry>) => setForm((p) => ({ ...p, payments: p.payments.map((x) => x.id === id ? { ...x, ...patch } : x) }));
  const removePayment = (id: string) => setForm((p) => ({ ...p, payments: p.payments.filter((x) => x.id !== id) }));

  const supplierKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!filteredSuppliers.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierHighlight((v) => (v + 1) % filteredSuppliers.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierHighlight((v) => (v - 1 + filteredSuppliers.length) % filteredSuppliers.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (supplierHighlight >= 0) selectSupplier(filteredSuppliers[supplierHighlight]); }
    else if (e.key === 'Escape') setShowSupplierDropdown(false);
  };
  const productKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!filteredProducts.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setProductHighlight((v) => (v + 1) % filteredProducts.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setProductHighlight((v) => (v - 1 + filteredProducts.length) % filteredProducts.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (productHighlight >= 0) addItem(filteredProducts[productHighlight]); }
    else if (e.key === 'Escape') setShowProductDropdown(false);
  };

  const inputClass = 'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:bg-white outline-none transition';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1.5';
  const cardClass = 'bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg shadow-slate-200/50 border border-slate-100 p-6';
  const sectionTitleClass = 'text-lg font-semibold mb-5 flex items-center gap-2 text-slate-800';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 pb-24">
      {(companiesError || suppliersError || productsError) && (
        <div className="mx-4 md:mx-8 mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl flex items-start gap-2 text-sm">
          <FiAlertCircle className="mt-0.5 shrink-0" />
          <div>Some master data could not be loaded. {companiesError || suppliersError || productsError}</div>
        </div>
      )}
      {errorMsg && <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-start gap-2"><FiX className="mt-0.5 shrink-0" /><span>{errorMsg}</span></div>}

      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-blue-700`}><FiUser /> Supplier Information</h2>
            <div className="space-y-5">
              <div><label className={labelClass}>Company *</label><select value={form.company_id} disabled={submitting || savingDraft} onChange={(e) => { updateForm('company_id', e.target.value ? Number(e.target.value) : ''); updateForm('supplier_id', ''); setSupplierSearch(''); }} className={`${inputClass} ${formErrors.company_id ? 'border-red-400' : ''}`}><option value="">{companiesLoading ? 'Loading companies...' : 'Select Company'}</option>{companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{formErrors.company_id && <p className="text-xs text-red-500 mt-1">{formErrors.company_id}</p>}</div>
              <div ref={supplierDropdownRef}><label className={labelClass}>Supplier *</label><div className="flex gap-2"><div className="relative flex-1"><input value={supplierSearch} onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); setSupplierHighlight(-1); }} onFocus={() => setShowSupplierDropdown(true)} onKeyDown={supplierKeyDown} placeholder="Search supplier by name, code, GST, phone..." className={`${inputClass} ${formErrors.supplier_id ? 'border-red-400' : ''}`} />{supplierSearch && <button type="button" onClick={() => { setSupplierSearch(''); updateForm('supplier_id', ''); }} className="absolute right-3 top-3 text-slate-400"><FiX /></button>}{showSupplierDropdown && <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">{suppliersLoading ? <div className="p-4 text-sm text-slate-500 flex justify-center"><FiLoader className="animate-spin mr-2" />Loading...</div> : filteredSuppliers.length === 0 ? <div className="p-4 text-sm text-slate-500">No suppliers found.</div> : filteredSuppliers.map((s, idx) => <button type="button" key={s.id} className={`w-full text-left px-4 py-3 flex items-center justify-between border-b border-slate-100 ${idx === supplierHighlight ? 'bg-blue-50' : 'hover:bg-blue-50'}`} onMouseEnter={() => setSupplierHighlight(idx)} onClick={() => selectSupplier(s)}><span className="min-w-0"><span className="block font-medium truncate">{s.name}</span><span className="block text-xs text-slate-500 truncate">{s.gst_number ? `GST: ${s.gst_number}` : ''}{s.phone || s.contact_no ? `  •  ${s.phone || s.contact_no}` : ''}</span></span>{idx === supplierHighlight && <FiChevronRight className="text-blue-500 shrink-0" />}</button>)}</div>}</div><button type="button" onClick={openSupplier} className="px-4 rounded-xl border border-blue-200 text-blue-600 hover:bg-blue-50">Add Supplier</button></div>{formErrors.supplier_id && <p className="text-xs text-red-500 mt-1">{formErrors.supplier_id}</p>}</div>
              <div><label className={labelClass}>M/S.</label><input value={form.supplier_name} onChange={(e) => updateForm('supplier_name', e.target.value)} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Contact Person</label><input value={form.contact_person} onChange={(e) => updateForm('contact_person', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>Phone No</label><input value={form.phone_no} onChange={(e) => updateForm('phone_no', e.target.value)} className={inputClass} /></div></div>
              <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Email</label><input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>GSTIN / PAN</label><input value={form.gstin_pan} onChange={(e) => updateForm('gstin_pan', e.target.value.toUpperCase())} className={inputClass} /></div></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reverse_charge} onChange={(e) => updateForm('reverse_charge', e.target.checked)} className="rounded" />Reverse Charge</label>
              <div><label className={labelClass}>Place of Supply *</label><input value={form.place_of_supply} onChange={(e) => updateForm('place_of_supply', e.target.value)} className={inputClass} placeholder="State / UT" /></div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className={`${sectionTitleClass} text-indigo-700`}><FiFileText /> Purchase Invoice Details</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div><label className={labelClass}>Invoice Type</label><select value={form.invoice_type} onChange={(e) => updateForm('invoice_type', e.target.value as PurchaseFormData['invoice_type'])} className={inputClass}><option value="purchase_invoice">Purchase Invoice</option><option value="purchase_bill">Purchase Bill</option></select></div><div><label className={labelClass}>Invoice No. *</label><div className="flex gap-1"><input value={form.invoice_no} onChange={(e) => updateForm('invoice_no', e.target.value.trimStart())} className={`${inputClass} flex-1 ${formErrors.invoice_no ? 'border-red-400' : ''}`} placeholder="Enter invoice number" /><button type="button" onClick={generateInvoiceNo} className="px-3 rounded-lg bg-slate-100 hover:bg-slate-200"><FiRefreshCw /></button></div>{formErrors.invoice_no && <p className="text-xs text-red-500 mt-1">{formErrors.invoice_no}</p>}</div><div><label className={labelClass}>Invoice Date *</label><input type="date" value={form.invoice_date} onChange={(e) => updateForm('invoice_date', e.target.value)} className={inputClass} /></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>Due Date</label><input type="date" value={form.due_date} onChange={(e) => updateForm('due_date', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>Delivery Mode</label><input value={form.delivery_mode} onChange={(e) => updateForm('delivery_mode', e.target.value)} className={inputClass} /></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>Challan No.</label><input value={form.challan_no} onChange={(e) => updateForm('challan_no', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>Challan Date</label><input type="date" value={form.challan_date} onChange={(e) => updateForm('challan_date', e.target.value)} className={inputClass} /></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>L.R. No.</label><input value={form.lr_no} onChange={(e) => updateForm('lr_no', e.target.value)} className={inputClass} /></div><div><label className={labelClass}>E-Way Bill</label><input value={form.eway_no} onChange={(e) => updateForm('eway_no', e.target.value)} className={inputClass} /></div></div>
            </div>
          </div>
        </div>

        <section className={`${cardClass} p-0 overflow-hidden`}>
          <div ref={productDropdownRef} className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50"><div className="flex gap-2"><div className="relative flex-1"><FiSearch className="absolute left-4 top-3.5 text-slate-400" /><input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setShowProductDropdown(true); setProductHighlight(-1); }} onFocus={() => setShowProductDropdown(true)} onKeyDown={productKeyDown} placeholder="Search product by name, SKU, barcode or HSN..." className="w-full pl-12 pr-10 py-3 rounded-xl border-0 bg-white shadow-sm focus:ring-2 focus:ring-blue-500/30 outline-none" />{productSearch && <button type="button" onClick={() => { setProductSearch(''); setShowProductDropdown(false); }} className="absolute right-3 top-3 text-slate-400"><FiX /></button>}{showProductDropdown && <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">{productsLoading ? <div className="p-4 flex justify-center text-sm text-slate-500"><FiLoader className="animate-spin mr-2" />Loading...</div> : filteredProducts.length === 0 ? <div className="p-4 text-sm text-slate-500">No products found.</div> : filteredProducts.map((p, idx) => <button type="button" key={p.id} onMouseEnter={() => setProductHighlight(idx)} onClick={() => addItem(p)} className={`w-full text-left px-4 py-3 flex justify-between items-center border-b border-slate-100 ${idx === productHighlight ? 'bg-blue-50' : 'hover:bg-blue-50'}`}><span className="min-w-0"><span className="block font-medium truncate">{p.name}</span><span className="block text-xs text-slate-500 truncate">{p.sku ? `SKU: ${p.sku}  ` : ''}{p.uom || p.unit || 'NOS'}{p.stock_quantity != null ? `  •  Stock: ${p.stock_quantity}` : ''}</span></span><span className="font-medium">₹{formatCurrency(p.purchase_price)}</span></button>)}</div>}</div><button type="button" onClick={openProduct} className="px-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"><FiPlus />Add Product</button></div></div>

          <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm min-w-[1150px]"><thead><tr className="text-left text-xs font-medium text-slate-500 uppercase bg-slate-50/80"><th className="p-3">Item</th><th className="p-3 text-center">Qty</th><th className="p-3">Unit</th><th className="p-3 text-right">Price</th><th className="p-3">Discount</th><th className="p-3">GST</th><th className="p-3">Tax Mode</th><th className="p-3 text-right">Total</th><th></th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={9} className="text-center py-16 text-slate-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</td></tr> : items.map((item, idx) => <tr key={`${item.product_id}-${idx}`} className="border-b border-slate-100 hover:bg-slate-50"><td className="p-2 max-w-[240px]"><input value={item.product_name} onChange={(e) => updateItem(idx, { product_name: e.target.value })} className="w-full bg-transparent border-0 focus:ring-0 p-1 truncate" /></td><td className="p-2"><input type="number" min="1" step="0.01" value={item.qty} onChange={(e) => updateItem(idx, { qty: normalizeNumber(e.target.value) })} className={`w-20 bg-transparent border-0 focus:ring-0 text-center ${item.qty <= 0 ? 'text-red-500' : ''}`} /></td><td className="p-2"><input value={item.uom} onChange={(e) => updateItem(idx, { uom: e.target.value })} className="w-16 bg-transparent border-0 focus:ring-0 text-center" /></td><td className="p-2"><input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(idx, { price: normalizeNumber(e.target.value) })} className="w-24 bg-transparent border-0 focus:ring-0 text-right" /></td><td className="p-2"><div className="flex gap-1"><select value={item.discount_type} onChange={(e) => updateItem(idx, { discount_type: e.target.value as DiscountType, discount_percent: e.target.value === 'amount' ? 0 : item.discount_percent, discount_amount: e.target.value === 'percent' ? 0 : item.discount_amount })} className="bg-transparent border-0 focus:ring-0"><option value="percent">%</option><option value="amount">₹</option></select><input type="number" min="0" step="0.01" value={item.discount_type === 'percent' ? item.discount_percent : item.discount_amount} onChange={(e) => updateItem(idx, item.discount_type === 'percent' ? { discount_percent: normalizeNumber(e.target.value) } : { discount_amount: normalizeNumber(e.target.value) })} className="w-20 bg-transparent border-0 focus:ring-0 text-right" /></div></td><td className="p-2"><select value={item.gst_slab} onChange={(e) => updateItem(idx, { gst_slab: Number(e.target.value) })} className="bg-transparent border-0 focus:ring-0"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" min="0" max="100" step="0.01" value={item.custom_gst_rate} onChange={(e) => updateItem(idx, { custom_gst_rate: normalizeNumber(e.target.value) })} className="w-20 mt-1 bg-white border border-slate-200 rounded px-1 py-0.5 text-xs" />}</td><td className="p-2"><label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={item.is_inter_state} onChange={(e) => updateItem(idx, { is_inter_state: e.target.checked })} />IGST</label></td><td className="p-2 text-right font-semibold">₹{formatCurrency(item.total)}</td><td className="p-2"><button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 /></button></td></tr>)}</tbody></table></div>

          <div className="md:hidden p-4 space-y-4">{items.length === 0 ? <div className="text-center py-16 text-slate-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</div> : items.map((item, idx) => <div key={`${item.product_id}-${idx}`} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200"><div className="flex justify-between"><span className="text-xs text-slate-400">#{idx + 1}</span><button type="button" onClick={() => removeItem(idx)} className="text-red-400"><FiTrash2 /></button></div><input value={item.product_name} onChange={(e) => updateItem(idx, { product_name: e.target.value })} className="w-full bg-transparent border-0 font-medium" /><div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Qty</label><input type="number" min="1" step="0.01" value={item.qty} onChange={(e) => updateItem(idx, { qty: normalizeNumber(e.target.value) })} className={inputClass} /></div><div><label className={labelClass}>Unit</label><input value={item.uom} onChange={(e) => updateItem(idx, { uom: e.target.value })} className={inputClass} /></div><div><label className={labelClass}>Price</label><input type="number" min="0" step="0.01" value={item.price} onChange={(e) => updateItem(idx, { price: normalizeNumber(e.target.value) })} className={inputClass} /></div><div><label className={labelClass}>GST</label><select value={item.gst_slab} onChange={(e) => updateItem(idx, { gst_slab: Number(e.target.value) })} className={inputClass}><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select></div></div>{item.gst_slab === -1 && <input type="number" min="0" max="100" step="0.01" value={item.custom_gst_rate} onChange={(e) => updateItem(idx, { custom_gst_rate: normalizeNumber(e.target.value) })} className={inputClass} placeholder="Custom GST %" />}<div className="grid grid-cols-2 gap-2"><div><label className={labelClass}>Discount Type</label><select value={item.discount_type} onChange={(e) => updateItem(idx, { discount_type: e.target.value as DiscountType })} className={inputClass}><option value="percent">Percent</option><option value="amount">Amount</option></select></div><div><label className={labelClass}>Discount</label><input type="number" min="0" step="0.01" value={item.discount_type === 'percent' ? item.discount_percent : item.discount_amount} onChange={(e) => updateItem(idx, item.discount_type === 'percent' ? { discount_percent: normalizeNumber(e.target.value) } : { discount_amount: normalizeNumber(e.target.value) })} className={inputClass} /></div></div><label className="text-xs flex items-center gap-2"><input type="checkbox" checked={item.is_inter_state} onChange={(e) => updateItem(idx, { is_inter_state: e.target.checked })} />Use IGST</label><div className="text-right font-bold">₹{formatCurrency(item.total)}</div></div>)}</div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Invoice Information</h2>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>Payment Type</label><select value={form.payment_type} onChange={(e) => updateForm('payment_type', e.target.value as PurchaseFormData['payment_type'])} className={inputClass}><option value="credit">Credit</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="online">Online</option><option value="bank_transfer">Bank Transfer</option></select></div><div><label className={labelClass}>Bank</label><select value={form.bank_id} onChange={(e) => updateForm('bank_id', e.target.value ? Number(e.target.value) : '')} className={inputClass}><option value="">Select Bank</option>{banks?.map((b) => <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>)}</select></div></div>
              <div><label className={labelClass}>Terms & Conditions</label><input value={form.terms_title} onChange={(e) => updateForm('terms_title', e.target.value)} className={inputClass} /><textarea rows={4} value={form.terms_detail} onChange={(e) => updateForm('terms_detail', e.target.value)} className={`${inputClass} mt-2`} /></div>
              <div><label className={labelClass}>Document Note</label><textarea rows={2} value={form.document_note} onChange={(e) => updateForm('document_note', e.target.value)} className={inputClass} /></div>
              <div><label className={labelClass}>Internal Note</label><textarea rows={2} value={form.internal_note} onChange={(e) => updateForm('internal_note', e.target.value)} className={inputClass} /></div>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className={sectionTitleClass}>Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>₹{formatCurrency(itemSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Item Discount</span><span className="text-red-500">-₹{formatCurrency(itemDiscountTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxable Amount</span><span>₹{formatCurrency(taxableBeforeBillDiscount)}</span></div>
              <div className="flex items-center justify-between gap-2"><span className="text-slate-500">Bill Discount</span><div className="flex items-center gap-1"><select value={generalDiscountType} onChange={(e) => { const type = e.target.value as DiscountType; setGeneralDiscountType(type); setForm((p) => ({ ...p, general_discount_percent: type === 'percent' ? p.general_discount_percent : 0, general_discount_amount: type === 'amount' ? p.general_discount_amount : 0 })); }} className="border rounded-lg px-2 py-1 text-xs"><option value="percent">%</option><option value="amount">₹</option></select><input type="number" min="0" step="0.01" value={generalDiscountType === 'percent' ? form.general_discount_percent : form.general_discount_amount} onChange={(e) => updateForm(generalDiscountType === 'percent' ? 'general_discount_percent' : 'general_discount_amount', normalizeNumber(e.target.value))} className="w-24 text-right border rounded-lg px-2 py-1.5" /></div></div>
              <div className="flex items-center gap-2 text-xs"><span>Apply:</span><select value={generalDiscountApplyType} onChange={(e) => setGeneralDiscountApplyType(e.target.value as ApplyType)} className="border rounded-lg px-2 py-1"><option value="before_tax">Before Tax</option><option value="after_tax">After Tax</option></select><span className="ml-auto text-red-500">-₹{formatCurrency(generalDiscountAmount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CGST</span><span>₹{formatCurrency(itemCgstTotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">SGST</span><span>₹{formatCurrency(itemSgstTotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">IGST</span><span>₹{formatCurrency(itemIgstTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Additional Charges</span><span>₹{formatCurrency(additionalChargesTotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Packing Charges</span><input type="number" min="0" step="0.01" value={form.packing_charges} onChange={(e) => updateForm('packing_charges', nonNegative(e.target.value))} className="w-28 text-right border rounded-lg px-2 py-1.5" /></div>
              <div className="flex items-center gap-2 text-xs"><span>Apply packing:</span><select value={packingApplyType} onChange={(e) => setPackingApplyType(e.target.value as ApplyType)} className="border rounded-lg px-2 py-1"><option value="before_tax">Before Tax</option><option value="after_tax">After Tax</option></select><span className="ml-auto">Tax ₹{formatCurrency(packingTax)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">TCS</span><span>₹{formatCurrency(tcsAmount)}</span></div>
              <div className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoRoundOff} onChange={(e) => setAutoRoundOff(e.target.checked)} />Auto round off</label><input type="number" step="0.01" value={form.round_off} disabled={autoRoundOff} onChange={(e) => updateForm('round_off', normalizeNumber(e.target.value))} className="w-24 text-right border rounded-lg px-2 py-1.5" /></div>
              <hr />
              <div className="flex justify-between text-base font-bold"><span>Grand Total</span><span>₹{formatCurrency(grandTotal)}</span></div><div className="text-xs text-slate-500">{totalInWords}</div>

              <div className="border-t pt-4 mt-5"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Additional Charges Detail</h3><button type="button" onClick={addCharge} className="text-blue-600 text-xs flex gap-1 items-center"><FiPlus />Add</button></div>{form.additional_charges.map((charge) => <div key={charge.id} className="flex gap-2 mb-2"><input value={charge.label} onChange={(e) => updateCharge(charge.id, { label: e.target.value })} placeholder="Charge name" className="flex-1 border rounded-lg px-2 py-1.5 text-xs" /><input type="number" min="0" step="0.01" value={charge.amount} onChange={(e) => updateCharge(charge.id, { amount: nonNegative(e.target.value) })} className="w-28 border rounded-lg px-2 py-1.5 text-xs text-right" /><button type="button" onClick={() => removeCharge(charge.id)} className="text-red-400"><FiTrash2 /></button></div>)}</div>

              <div className="border-t pt-4 mt-5"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">Payments</h3><button type="button" onClick={addPayment} className="text-blue-600 text-xs flex items-center gap-1"><FiPlus />Add Payment</button></div>{form.payments.length === 0 ? <p className="text-xs text-slate-400">No payments recorded.</p> : form.payments.map((pay, idx) => <div key={pay.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200 mb-3"><div className="flex justify-between mb-2"><span className="text-xs font-semibold text-slate-500">Payment #{idx + 1}</span><button type="button" onClick={() => removePayment(pay.id)} className="text-red-400"><FiTrash2 /></button></div><div className="grid grid-cols-2 gap-2"><div><label className="block text-xs text-slate-500">Amount</label><input type="number" min="0" step="0.01" value={pay.amount} onChange={(e) => updatePayment(pay.id, { amount: nonNegative(e.target.value) })} className="w-full border rounded-lg px-2 py-1.5 text-xs" /></div><div><label className="block text-xs text-slate-500">Method</label><select value={pay.payment_method} onChange={(e) => updatePayment(pay.id, { payment_method: e.target.value as PaymentMethod })} className="w-full border rounded-lg px-2 py-1.5 text-xs"><option value="UPI">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="bank_transfer">Bank Transfer</option><option value="other">Other</option></select></div><div><label className="block text-xs text-slate-500">Reference No</label><input value={pay.reference_no} onChange={(e) => updatePayment(pay.id, { reference_no: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-xs" /></div><div><label className="block text-xs text-slate-500">Date</label><input type="date" value={pay.transaction_date} onChange={(e) => updatePayment(pay.id, { transaction_date: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-xs" /></div><div><label className="block text-xs text-slate-500">Direction</label><select value={pay.payment_direction} onChange={(e) => updatePayment(pay.id, { payment_direction: e.target.value as PaymentDirection })} className="w-full border rounded-lg px-2 py-1.5 text-xs"><option value="outward">Outward</option><option value="inward">Inward / Refund</option></select></div><div><label className="block text-xs text-slate-500">Bank Name</label><input value={pay.bank_name} onChange={(e) => updatePayment(pay.id, { bank_name: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-xs" /></div><div className="col-span-2"><label className="block text-xs text-slate-500">Remarks</label><input value={pay.remarks} onChange={(e) => updatePayment(pay.id, { remarks: e.target.value })} className="w-full border rounded-lg px-2 py-1.5 text-xs" /></div></div></div>)}<div className="flex justify-between text-sm"><span>Total Outward</span><span>₹{formatCurrency(totalOutward)}</span></div><div className="flex justify-between text-sm"><span>Total Inward</span><span>₹{formatCurrency(totalInward)}</span></div><div className="flex justify-between mt-1 font-semibold"><span>Balance Due</span><span className={balanceDue > 0.01 ? 'text-red-600' : 'text-emerald-600'}>₹{formatCurrency(balanceDue)}</span></div></div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-slate-200 shadow-2xl p-4 flex flex-wrap justify-end gap-3 z-40"><button type="button" onClick={() => navigate('/purchases')} disabled={submitting || savingDraft} className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm">Cancel</button><button type="button" onClick={() => handleSubmit('save_draft')} disabled={submitting || savingDraft} className="px-5 py-2.5 rounded-xl border border-slate-300 text-sm flex items-center gap-2">{savingDraft ? <FiLoader className="animate-spin" /> : <FiSave />}Save Draft</button><button type="button" onClick={() => handleSubmit('save')} disabled={submitting || savingDraft} className="px-5 py-2.5 rounded-xl bg-slate-800 text-white text-sm flex items-center gap-2">{submitting ? <FiLoader className="animate-spin" /> : <FiCheckCircle />}Save Purchase</button><button type="button" onClick={() => handleSubmit('save_print')} disabled={submitting || savingDraft} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm flex items-center gap-2">{submitting ? <FiLoader className="animate-spin" /> : <FiPrinter />}Print & Save</button></div>

      {showSupplierOffcanvas && <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}><Offcanvas isOpen={showSupplierOffcanvas} title="Add Supplier" onClose={() => !supplierSubmitting && setShowSupplierOffcanvas(false)} footer={<div className="flex justify-between w-full"><button onClick={() => setShowSupplierOffcanvas(false)} disabled={supplierSubmitting} className="px-4 py-2 rounded-lg border">Close</button><button onClick={createSupplier} disabled={supplierSubmitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white">{supplierSubmitting ? 'Creating...' : 'Create Supplier'}</button></div>}><div className="space-y-5 overflow-y-auto pr-2" style={{ maxHeight: '70vh' }}><fieldset className="border rounded-xl p-4"><legend className="font-semibold px-2">Basic Information</legend><div className="space-y-4 mt-2"><div><label className={labelClass}>Company *</label><select value={newSupplier.company_id} onChange={(e) => setNewSupplier((p) => ({ ...p, company_id: e.target.value }))} className={inputClass}><option value="">Select Company</option>{companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className={labelClass}>Supplier Name *</label><input value={newSupplier.name} onChange={(e) => setNewSupplier((p) => ({ ...p, name: e.target.value }))} className={inputClass} /></div><div className="grid grid-cols-2 gap-4"><input placeholder="Contact Person" value={newSupplier.contact_person} onChange={(e) => setNewSupplier((p) => ({ ...p, contact_person: e.target.value }))} className={inputClass} /><input placeholder="Contact No" value={newSupplier.contact_no} onChange={(e) => setNewSupplier((p) => ({ ...p, contact_no: e.target.value }))} className={inputClass} /></div><div className="grid grid-cols-2 gap-4"><input placeholder="Email" type="email" value={newSupplier.email} onChange={(e) => setNewSupplier((p) => ({ ...p, email: e.target.value }))} className={inputClass} /><input placeholder="Phone" value={newSupplier.phone} onChange={(e) => setNewSupplier((p) => ({ ...p, phone: e.target.value }))} className={inputClass} /></div></div></fieldset><fieldset className="border rounded-xl p-4"><legend className="font-semibold px-2">Tax Details</legend><div className="grid grid-cols-2 gap-4 mt-2"><input placeholder="GST Number" value={newSupplier.gst_number} onChange={(e) => setNewSupplier((p) => ({ ...p, gst_number: e.target.value.toUpperCase() }))} className={inputClass} /><input placeholder="PAN" value={newSupplier.pan} onChange={(e) => setNewSupplier((p) => ({ ...p, pan: e.target.value.toUpperCase() }))} className={inputClass} /></div></fieldset><fieldset className="border rounded-xl p-4"><legend className="font-semibold px-2">Billing Address</legend><div className="space-y-3 mt-2"><textarea rows={2} value={newSupplier.billing_street} onChange={(e) => setNewSupplier((p) => ({ ...p, billing_street: e.target.value }))} className={inputClass} placeholder="Street Address" /><div className="grid grid-cols-2 gap-3"><input placeholder="City" value={newSupplier.billing_city} onChange={(e) => setNewSupplier((p) => ({ ...p, billing_city: e.target.value }))} className={inputClass} /><input placeholder="State" value={newSupplier.billing_state} onChange={(e) => setNewSupplier((p) => ({ ...p, billing_state: e.target.value }))} className={inputClass} /></div><div className="grid grid-cols-2 gap-3"><input placeholder="Country" value={newSupplier.billing_country} onChange={(e) => setNewSupplier((p) => ({ ...p, billing_country: e.target.value }))} className={inputClass} /><input placeholder="Pincode" value={newSupplier.billing_pincode} onChange={(e) => setNewSupplier((p) => ({ ...p, billing_pincode: e.target.value }))} className={inputClass} /></div></div></fieldset></div></Offcanvas></Suspense>}

      {showProductOffcanvas && <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}><Offcanvas isOpen={showProductOffcanvas} title="Add Product" onClose={() => !productSubmitting && setShowProductOffcanvas(false)} footer={<div className="flex justify-between w-full"><button onClick={() => setShowProductOffcanvas(false)} disabled={productSubmitting} className="px-4 py-2 rounded-lg border">Close</button><button onClick={createProduct} disabled={productSubmitting} className="px-5 py-2 rounded-lg bg-emerald-600 text-white">{productSubmitting ? 'Creating...' : 'Create Product'}</button></div>}><div className="space-y-5 overflow-y-auto pr-2" style={{ maxHeight: '70vh' }}><fieldset className="border rounded-xl p-4"><legend className="font-semibold px-2">Basic Information</legend><div className="space-y-4 mt-2"><div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>Company *</label><select value={newProduct.company_id} onChange={(e) => setNewProduct((p) => ({ ...p, company_id: e.target.value }))} className={`${inputClass} ${productFormErrors.company_id ? 'border-red-400' : ''}`}><option value="">Select Company</option>{companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className={labelClass}>Branch</label><input value={newProduct.branch_id} onChange={(e) => setNewProduct((p) => ({ ...p, branch_id: e.target.value }))} className={inputClass} placeholder="Branch ID (optional)" /></div></div><div><label className={labelClass}>Product Name *</label><input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} className={`${inputClass} ${productFormErrors.name ? 'border-red-400' : ''}`} /></div><div className="grid grid-cols-2 gap-4"><input placeholder="SKU" value={newProduct.sku} onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))} className={inputClass} /><input placeholder="HSN/SAC Code" value={newProduct.hsn_sac_code} onChange={(e) => setNewProduct((p) => ({ ...p, hsn_sac_code: e.target.value }))} className={inputClass} /></div><div className="grid grid-cols-2 gap-4"><input placeholder="Unit" value={newProduct.unit} onChange={(e) => setNewProduct((p) => ({ ...p, unit: e.target.value }))} className={`${inputClass} ${productFormErrors.unit ? 'border-red-400' : ''}`} /><input type="number" min="0" step="0.01" placeholder="Purchase Price" value={newProduct.purchase_price} onChange={(e) => setNewProduct((p) => ({ ...p, purchase_price: e.target.value }))} className={`${inputClass} ${productFormErrors.purchase_price ? 'border-red-400' : ''}`} /></div><div className="grid grid-cols-2 gap-4"><input type="number" min="0" step="0.01" placeholder="Sale Price" value={newProduct.sale_price} onChange={(e) => setNewProduct((p) => ({ ...p, sale_price: e.target.value }))} className={inputClass} /><input type="number" min="0" max="100" step="0.01" placeholder="Tax Rate %" value={newProduct.tax_rate} onChange={(e) => setNewProduct((p) => ({ ...p, tax_rate: e.target.value }))} className={inputClass} /></div></div></fieldset><fieldset className="border rounded-xl p-4"><legend className="font-semibold px-2">Stock & Notes</legend><div className="grid grid-cols-2 gap-4 mt-2"><input type="number" placeholder="Stock Quantity" value={newProduct.stock_quantity} onChange={(e) => setNewProduct((p) => ({ ...p, stock_quantity: e.target.value }))} className={inputClass} /><input type="number" placeholder="Reorder Level" value={newProduct.reorder_level} onChange={(e) => setNewProduct((p) => ({ ...p, reorder_level: e.target.value }))} className={inputClass} /></div><textarea rows={3} placeholder="Description" value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} className={`${inputClass} mt-4`} /></fieldset></div></Offcanvas></Suspense>}
    </div>
  );
}