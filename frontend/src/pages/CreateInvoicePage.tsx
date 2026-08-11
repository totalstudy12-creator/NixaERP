// src/pages/CreateInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  FiPlus, FiTrash2, FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiPrinter, FiCreditCard, FiGlobe, FiLoader
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

interface InvoiceFormData {
  company_id: number | ''; branch: string; customer_id: number | '';
  customer_name: string;
  billing_street: string; billing_city: string; billing_state: string; billing_country: string; billing_pincode: string;
  shipping_street: string; shipping_city: string; shipping_state: string; shipping_country: string; shipping_pincode: string;
  same_as_billing: boolean;
  contact_person: string; contact_no: string;
  gstin_pan: string; reverse_charge: boolean; ship_to: string; place_of_supply: string;
  invoice_type: 'tax_invoice' | 'retail_invoice' | 'export_invoice'; invoice_no: string;
  invoice_date: string; challan_no: string; challan_date: string; po_no: string; po_date: string;
  lr_no: string; eway_no: string; delivery_mode: string; payment_type: 'credit' | 'cash' | 'cheque' | 'online' | 'bajaj_finance';
  payment_received: number; keep_advance: boolean; remarks: string; payment_term: string;
  due_date: string; bank_id: number | ''; packing_charges: number; general_discount_percent: number;
  general_discount_amount: number; tcs_percent: number; round_off: number; terms_title: string;
  terms_detail: string; document_note: string; additional_charges: AdditionalCharge[]; internal_note: string;
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
function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const [data, setData] = useState<T | null>(null);
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
      const result = Array.isArray(res) ? res : (res as any).data ?? [];
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

  const getCompanies = useCallback(() => apiClient.getCompanies(), []);
  const getCustomers = useCallback(() => apiClient.getAllCustomers(), []);
  const getProducts = useCallback(() => apiClient.getProducts(), []);
  const getBanks = useCallback(async () => { try { return await apiClient.request('GET', '/banks'); } catch { return []; } }, []);

  const { data: companies } = useApiCache<Company[]>('companies', getCompanies);
  const { data: customers, refresh: refreshCustomers } = useApiCache<Customer[]>('customers', getCustomers);
  const { data: products } = useApiCache<Product[]>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount[]>('banks', getBanks);

  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);

  const generateInvoicePlaceholder = useCallback(() => {
    const y = new Date().getFullYear();
    return `INV-${y}-${Math.floor(1000 + Math.random() * 9000)}`;
  }, []);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ⭐ Auto round off
  const [autoRoundOff, setAutoRoundOff] = useState(true);

  const [form, setForm] = useState<InvoiceFormData>({
    company_id: '', branch: 'Main Branch', customer_id: '', customer_name: '',
    billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
    shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
    same_as_billing: true,
    contact_person: '', contact_no: '',
    gstin_pan: '', reverse_charge: false, ship_to: '', place_of_supply: '',
    invoice_type: 'tax_invoice', invoice_no: generateInvoicePlaceholder(),
    invoice_date: new Date().toISOString().split('T')[0], challan_no: '', challan_date: '',
    po_no: '', po_date: '', lr_no: '', eway_no: '', delivery_mode: '', payment_type: 'credit',
    payment_received: 0, keep_advance: false, remarks: '', payment_term: '', due_date: '',
    bank_id: '', packing_charges: 0, general_discount_percent: 0, general_discount_amount: 0,
    tcs_percent: 0, round_off: 0, terms_title: 'Terms and Conditions',
    terms_detail: '1. Subject to our home Jurisdiction.\n2. Our Responsibility Ceases as soon as goods leaves our Premises.\n3. Goods once sold will not taken back.\n4. Delivery Ex-Premises.\n5. Warranty (if any) is provided by the manufacturer.\nJurisdiction:',
    document_note: '', additional_charges: [], internal_note: '',
  });

  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Customer creation offcanvas
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

  // ── Fetch real branches when company changes ──
  useEffect(() => {
    if (!form.company_id) {
      setAvailableBranches([]);
      setForm(prev => ({ ...prev, branch: 'Main Branch' }));
      return;
    }
    setBranchLoading(true);
    apiClient.getBranchesByCompany(Number(form.company_id))
      .then(res => {
        const branchList = Array.isArray(res) ? res : (res?.data ?? []);
        setAvailableBranches(branchList);
        setForm(prev => {
          if (branchList.length === 0) return { ...prev, branch: 'Main Branch' };
          const firstBranchName = branchList[0]?.name || 'Main Branch';
          if (!branchList.some((b: any) => b.name === prev.branch)) return { ...prev, branch: firstBranchName };
          return prev;
        });
      })
      .catch(() => setAvailableBranches([]))
      .finally(() => setBranchLoading(false));
  }, [form.company_id]);

  // Filtered data
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

  // Auto‑fill customer info
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
          shipping_street: cust.shipping_street || '',
          shipping_city: cust.shipping_city || '',
          shipping_state: cust.shipping_state || '',
          shipping_country: cust.shipping_country || 'India',
          shipping_pincode: cust.shipping_pincode || '',
          contact_person: cust.contact_person || '',
          contact_no: cust.contact_no || '',
          gstin_pan: cust.gstin || cust.pan || '',
          ship_to: cust.shipping_street ? 'shipping' : 'billing',
          same_as_billing: !cust.shipping_street || (
            cust.billing_street === cust.shipping_street &&
            cust.billing_city === cust.shipping_city &&
            cust.billing_state === cust.shipping_state &&
            cust.billing_country === cust.shipping_country &&
            cust.billing_pincode === cust.shipping_pincode
          ),
        }));
        setCustomerSearch(cust.name);
      }
    }
  }, [form.customer_id, customers]);

  // Create customer from offcanvas
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
    } catch (err: any) { showError('Create failed', err.message); }
  };

  // ── Item Management ──
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) { showError('Duplicate', 'Product already in list.'); return; }
    const price = product.sale_price || product.price || 0;
    const newItem: InvoiceItem = {
      product_id: product.id, product_name: product.name, hsn_sac_code: product.hsn_sac_code || '',
      qty: 1, uom: product.uom || product.unit || 'NOS', price: price,
      discount_type: 'percent', discount_percent: 0, discount_amount: 0,
      gst_slab: product.igst_rate || product.tax_rate || 0, is_inter_state: true,
      cgst_percent: 0, sgst_percent: 0, igst_percent: product.igst_rate || product.tax_rate || 0,
      cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total: 0,
    };
    const base = newItem.qty * newItem.price;
    const discount = newItem.discount_type === 'percent' ? base * (newItem.discount_percent / 100) : newItem.discount_amount;
    const afterDiscount = base - discount;
    let cgst = 0, sgst = 0, igst = 0;
    if (newItem.is_inter_state) { igst = afterDiscount * (newItem.gst_slab / 100); }
    else { const half = newItem.gst_slab / 2; cgst = afterDiscount * (half / 100); sgst = afterDiscount * (half / 100); }
    newItem.cgst_amount = cgst; newItem.sgst_amount = sgst; newItem.igst_amount = igst;
    newItem.total = afterDiscount + cgst + sgst + igst;
    setItems(prev => [...prev, newItem]);
    setProductSearch('');
  }, [items, showError]);

  const removeItem = useCallback((index: number) => setItems(prev => prev.filter((_, i) => i !== index)), []);
  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => { const updated = [...prev]; updated[index] = { ...updated[index], [field]: value }; return updated; });
  }, []);
  const recalcItem = useCallback((index: number) => {
    setItems(prev => {
      const updated = [...prev]; const item = { ...updated[index] };
      const base = item.qty * item.price;
      const discount = item.discount_type === 'percent' ? base * (item.discount_percent / 100) : item.discount_amount;
      const afterDiscount = base - discount; const slab = item.gst_slab || 0;
      if (item.is_inter_state) {
        item.igst_percent = slab; item.cgst_percent = 0; item.sgst_percent = 0;
        item.igst_amount = afterDiscount * (slab / 100); item.cgst_amount = 0; item.sgst_amount = 0;
      } else {
        const half = slab / 2; item.cgst_percent = half; item.sgst_percent = half; item.igst_percent = 0;
        item.cgst_amount = afterDiscount * (half / 100); item.sgst_amount = afterDiscount * (half / 100); item.igst_amount = 0;
      }
      item.discount_amount = discount; item.total = afterDiscount + item.cgst_amount + item.sgst_amount + item.igst_amount;
      updated[index] = item; return updated;
    });
  }, []);

  // ── Additional Charges ──
  const addAdditionalCharge = () => setForm(prev => ({ ...prev, additional_charges: [...prev.additional_charges, { id: Date.now().toString(), label: '', amount: 0 }] }));
  const updateAdditionalCharge = (id: string, field: 'label' | 'amount', value: any) => setForm(prev => ({ ...prev, additional_charges: prev.additional_charges.map(c => c.id === id ? { ...c, [field]: value } : c) }));
  const removeAdditionalCharge = (id: string) => setForm(prev => ({ ...prev, additional_charges: prev.additional_charges.filter(c => c.id !== id) }));

  // ── Totals ──
  const itemSubtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.price, 0), [items]);
  const itemDiscountTotal = useMemo(() => items.reduce((s, i) => s + (i.discount_amount || 0), 0), [items]);
  const totalTax = useMemo(() => items.reduce((s, i) => s + i.cgst_amount + i.sgst_amount + i.igst_amount, 0), [items]);
  const itemTaxableTotal = itemSubtotal - itemDiscountTotal;
  const generalDiscountAmount = useMemo(() => form.general_discount_percent ? (itemTaxableTotal * form.general_discount_percent) / 100 : form.general_discount_amount, [itemTaxableTotal, form.general_discount_percent, form.general_discount_amount]);
  const additionalChargesTotal = useMemo(() => form.additional_charges.reduce((s, c) => s + (c.amount || 0), 0), [form.additional_charges]);
  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + form.packing_charges;
  const tcsAmount = useMemo(() => totalBeforeTcs * (form.tcs_percent / 100), [totalBeforeTcs, form.tcs_percent]);
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;

  // ⭐ Auto round off effect
  useEffect(() => {
    if (autoRoundOff) {
      const roundedTotal = Math.round(totalBeforeRoundOff);
      const roundOff = roundedTotal - totalBeforeRoundOff;
      setForm(prev => ({ ...prev, round_off: roundOff }));
    }
  }, [autoRoundOff, totalBeforeRoundOff]);

  const grandTotal = useMemo(() => totalBeforeRoundOff + form.round_off, [totalBeforeRoundOff, form.round_off]);
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);

  // ── Handlers ──
  const validate = () => {
    if (!form.company_id) { setErrorMsg('Select a company.'); return false; }
    if (!form.customer_id) { setErrorMsg('Select a customer.'); return false; }
    if (!form.invoice_no.trim()) { setErrorMsg('Invoice number is required.'); return false; }
    if (items.length === 0) { setErrorMsg('Add at least one product.'); return false; }
    return true;
  };

  const handleSubmit = useCallback(async (action: 'save' | 'save_print' | 'save_draft' = 'save') => {
    setErrorMsg(null);
    if (action !== 'save_draft' && !validate()) return;
    const payload = {
      company_id: Number(form.company_id), branch: form.branch, customer_id: Number(form.customer_id),
      customer_name: form.customer_name,
      billing_street: form.billing_street, billing_city: form.billing_city, billing_state: form.billing_state,
      billing_country: form.billing_country, billing_pincode: form.billing_pincode,
      shipping_street: form.same_as_billing ? form.billing_street : form.shipping_street,
      shipping_city: form.same_as_billing ? form.billing_city : form.shipping_city,
      shipping_state: form.same_as_billing ? form.billing_state : form.shipping_state,
      shipping_country: form.same_as_billing ? form.billing_country : form.shipping_country,
      shipping_pincode: form.same_as_billing ? form.billing_pincode : form.shipping_pincode,
      contact_person: form.contact_person, contact_no: form.contact_no,
      gstin: form.gstin_pan, pan: form.gstin_pan,
      reverse_charge: form.reverse_charge, ship_to: form.ship_to, place_of_supply: form.place_of_supply,
      invoice_type: form.invoice_type, invoice_no: form.invoice_no, invoice_date: form.invoice_date,
      due_date: form.due_date, challan_no: form.challan_no, challan_date: form.challan_date,
      po_no: form.po_no, po_date: form.po_date, lr_no: form.lr_no, eway_no: form.eway_no,
      delivery_mode: form.delivery_mode, payment_type: form.payment_type,
      payment_received: form.payment_received, keep_advance: form.keep_advance,
      remarks: form.remarks, payment_term: form.payment_term, bank_id: form.bank_id || null,
      packing_charges: form.packing_charges, general_discount_percent: form.general_discount_percent,
      general_discount_amount: generalDiscountAmount, tcs_percent: form.tcs_percent,
      round_off: form.round_off, terms_title: form.terms_title, terms_detail: form.terms_detail,
      document_note: form.document_note, internal_note: form.internal_note,
      additional_charges: form.additional_charges, total_amount: grandTotal,
      tax_amount: totalTax, discount_amount: itemDiscountTotal + generalDiscountAmount,
      status: action === 'save_draft' ? 'draft' : 'issued',
      items: items.map(i => ({
        product_id: i.product_id, quantity: i.qty, unit_price: i.price,
        discount_percent: i.discount_percent, discount_amount: i.discount_amount,
        discount_type: i.discount_type, gst_slab: i.gst_slab, is_inter_state: i.is_inter_state,
        cgst_percent: i.cgst_percent, sgst_percent: i.sgst_percent, igst_percent: i.igst_percent, total: i.total,
      })),
    };
    setSubmitting(true);
    try {
      const res = await apiClient.createInvoice(payload);
      const newInvoice = res.data || res;
      showSuccess('Invoice saved', `Invoice ${form.invoice_no} created.`);
      addAppLog({ module: 'Invoices', action: 'Create', status: 'success', message: form.invoice_no });
      if (action === 'save_print') navigate(`/invoices/${newInvoice.id}?print=1`);
      else navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) { showError('Error', err.message); setErrorMsg(err.message); }
    finally { setSubmitting(false); }
  }, [form, items, grandTotal, totalTax, itemDiscountTotal, generalDiscountAmount, navigate, showSuccess, showError]);

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
                <select value={form.company_id} onChange={e => setForm(prev => ({ ...prev, company_id: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}>
                  <option value="">Select Company</option>
                  {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Branch</label>
                <div className="relative">
                  <select value={form.branch} onChange={e => setForm(prev => ({ ...prev, branch: e.target.value }))} className={inputClass} disabled={branchLoading || !form.company_id}>
                    {branchLoading ? <option>Loading...</option> : availableBranches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                  {branchLoading && <div className="absolute right-8 top-2.5"><FiLoader className="animate-spin text-gray-400" size={16} /></div>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Customer *</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customer..." className={inputClass} />
                    {customerSearch && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filteredCustomers.map(c => (
                          <div key={c.id} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => { setForm(prev => ({ ...prev, customer_id: c.id })); setCustomerSearch(''); }}>
                            {c.name} {c.code ? `(${c.code})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowCustomerOffcanvas(true)} className="px-3 py-2 rounded-lg border text-sm text-blue-600 hover:bg-blue-50">Add</button>
                </div>
              </div>
              <div><label className="block text-sm font-medium mb-1">M/S.</label><input type="text" value={form.customer_name} onChange={e => setForm(prev => ({ ...prev, customer_name: e.target.value }))} className={inputClass} /></div>

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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">Shipping Address</h3>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={form.same_as_billing} onChange={e => setForm(prev => ({ ...prev, same_as_billing: e.target.checked }))} className="rounded border-gray-300 text-blue-600" />
                    <span>Same as Billing Address</span>
                  </label>
                </div>
                {!form.same_as_billing && (
                  <>
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
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Contact Person</label><input type="text" value={form.contact_person} onChange={e => setForm(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} /></div>
                <div><label className="block text-sm font-medium mb-1">Contact No</label><input type="text" value={form.contact_no} onChange={e => setForm(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">GSTIN / PAN</label><input type="text" value={form.gstin_pan} onChange={e => setForm(prev => ({ ...prev, gstin_pan: e.target.value }))} className={inputClass} /></div>
              <div className="flex items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reverse_charge} onChange={e => setForm(prev => ({ ...prev, reverse_charge: e.target.checked }))} /> Reverse Charge</label></div>
              <div><label className="block text-sm font-medium mb-1">Ship To</label><select value={form.ship_to} onChange={e => setForm(prev => ({ ...prev, ship_to: e.target.value }))} className={inputClass}><option value="">-- Select --</option><option value="billing">Same as Billing</option><option value="shipping">Shipping Address</option></select></div>
              <div><label className="block text-sm font-medium mb-1">Place of Supply *</label><input type="text" value={form.place_of_supply} onChange={e => setForm(prev => ({ ...prev, place_of_supply: e.target.value }))} className={inputClass} placeholder="State / UT" /></div>
            </div>
          </div>

          {/* Right: Invoice Details */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-600"><FiFileText /> Invoice Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">Invoice Type</label><select value={form.invoice_type} onChange={e => setForm(prev => ({ ...prev, invoice_type: e.target.value as any }))} className={inputClass}><option value="tax_invoice">Tax Invoice</option><option value="retail_invoice">Retail Invoice</option><option value="export_invoice">Export Invoice</option></select></div>
                <div><label className="block text-sm font-medium mb-1">Invoice No. *</label><input type="text" value={form.invoice_no} onChange={e => setForm(prev => ({ ...prev, invoice_no: e.target.value }))} className={inputClass} /></div>
                <div><label className="block text-sm font-medium mb-1">Invoice Date *</label><input type="date" value={form.invoice_date} onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">PO Number</label><input type="text" value={form.po_no} onChange={e => setForm(prev => ({ ...prev, po_no: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">PO Date</label><input type="date" value={form.po_date} onChange={e => setForm(prev => ({ ...prev, po_date: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Payment Terms</label><input type="text" value={form.payment_term} onChange={e => setForm(prev => ({ ...prev, payment_term: e.target.value }))} className={inputClass} placeholder="e.g., Net 30" /></div>
              <div><label className="block text-sm font-medium mb-1">E-Way Bill</label><input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} /></div>
            </div>
          </div>
        </div>

        {/* Items Section */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b">
            <div className="relative w-full">
              <FiSearch className="absolute left-4 top-3.5 text-gray-400 z-10" size={18} />
              <input type="text" placeholder="Search product by name, HSN or SKU and press Enter to add..." value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && productSearch.trim() && filteredProducts.length > 0) addItem(filteredProducts[0]); }} className="w-full pl-12 pr-4 py-3 rounded-xl border-0 bg-slate-50 text-sm focus:ring-2 focus:ring-blue-200 focus:bg-white outline-none transition" />
              {productSearch && <button className="absolute right-3 top-3 text-gray-400 hover:text-gray-600" onClick={() => setProductSearch('')}><FiX size={18} /></button>}
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map(p => (
                    <div key={p.id} className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0" onClick={() => addItem(p)}>
                      <div><span className="font-medium text-slate-700">{p.name}</span>{p.hsn_sac_code && <span className="ml-2 text-xs text-gray-400">HSN: {p.hsn_sac_code}</span>}</div>
                      <span className="text-gray-600 font-medium">₹{p.sale_price || p.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm min-w-[1000px]">
              <thead><tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider"><th className="py-3 px-3">Item</th><th className="py-3 px-3 text-center">Qty</th><th className="py-3 px-3 text-center">Unit</th><th className="py-3 px-3 text-right">Price</th><th className="py-3 px-3 text-center">Disc Type</th><th className="py-3 px-3 text-center">Discount</th><th className="py-3 px-3 text-center">GST Slab</th><th className="py-3 px-3 text-center">Inter</th><th className="py-3 px-3 text-right">Amount</th><th className="w-10"></th></tr></thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={10} className="text-center py-16 text-gray-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</td></tr> :
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                      <td className="py-2 px-3"><input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm p-1" /></td>
                      <td className="py-2 px-3"><input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} className="w-16 bg-transparent border-0 focus:ring-0 text-center p-1" />{products?.find(p => p.id === item.product_id)?.stock_quantity != null && <div className="text-xs text-gray-400 text-center -mt-0.5">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>}</td>
                      <td className="py-2 px-3"><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" /></td>
                      <td className="py-2 px-3"><input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} className="w-20 bg-transparent border-0 focus:ring-0 text-right p-1" /></td>
                      <td className="py-2 px-3"><select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm"><option value="percent">%</option><option value="amount">₹</option></select></td>
                      <td className="py-2 px-3">{item.discount_type === 'percent' ? <input type="number" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); recalcItem(idx); }} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" /> : <input type="number" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); recalcItem(idx); }} className="w-20 bg-transparent border-0 focus:ring-0 text-center p-1" />}</td>
                      <td className="py-2 px-3"><select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); } }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />}</td>
                      <td className="py-2 px-3"><label className="inline-flex items-center gap-1 text-xs cursor-pointer"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded border-gray-300" />IGST</label></td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{(item.total || 0).toFixed(2)}</td>
                      <td className="py-2 px-3"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 size={16} /></button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-4">
            {items.length === 0 ? <div className="text-center py-16 text-gray-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</div> :
              items.map((item, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                  <div className="flex justify-between items-start"><span className="text-xs font-semibold text-gray-400">#{idx + 1}</span><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 size={16} /></button></div>
                  <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm font-medium" />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500">Qty</label><input type="number" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                    <div><label className="text-xs text-gray-500">Unit</label><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500">Price</label><input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                    <div><label className="text-xs text-gray-500">Disc Type</label><select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value="percent">%</option><option value="amount">₹</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-xs text-gray-500">GST Slab</label><select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); } }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs mt-1" />}</div>
                    <div className="flex items-center gap-2"><label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded" />IGST</label></div>
                  </div>
                  <div className="text-right font-semibold">₹{(item.total || 0).toFixed(2)}</div>
                </div>
              ))
            }
          </div>
        </section>

        {/* Invoice Info & Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Information</h2>
            <div className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Bank</label><select value={form.bank_id} onChange={e => setForm(prev => ({ ...prev, bank_id: e.target.value ? Number(e.target.value) : '' }))} className={inputClass}><option value="">Select Bank</option>{banks?.map(b => <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>)}</select></div>
              <div><label className="block text-sm font-medium mb-1">Terms & Conditions</label><input type="text" value={form.terms_title} onChange={e => setForm(prev => ({ ...prev, terms_title: e.target.value }))} className={inputClass} /><textarea rows={4} value={form.terms_detail} onChange={e => setForm(prev => ({ ...prev, terms_detail: e.target.value }))} className={`${inputClass} mt-2`} /></div>
              <div><label className="block text-sm font-medium mb-1">Document Note</label><textarea rows={2} value={form.document_note} onChange={e => setForm(prev => ({ ...prev, document_note: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Internal Note</label><textarea rows={2} value={form.internal_note} onChange={e => setForm(prev => ({ ...prev, internal_note: e.target.value }))} className={inputClass} /></div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Taxable Amount</span><span className="font-medium">₹{itemTaxableTotal.toFixed(2)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-medium">General Discount %</label><input type="number" step="0.01" value={form.general_discount_percent} onChange={e => setForm(prev => ({ ...prev, general_discount_percent: Number(e.target.value) }))} className={inputClass} /></div>
                <div><label className="block text-xs font-medium">Or Amount</label><input type="number" step="0.01" value={form.general_discount_amount} onChange={e => setForm(prev => ({ ...prev, general_discount_amount: Number(e.target.value) }))} className={inputClass} /></div>
              </div>
              <div className="flex justify-between"><span>Packing Charges</span><input type="number" step="0.01" value={form.packing_charges} onChange={e => setForm(prev => ({ ...prev, packing_charges: Number(e.target.value) }))} className="w-24 text-right border rounded px-2 py-1" /></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><span>Additional Charges</span><button onClick={addAdditionalCharge} className="text-blue-600 text-xs flex items-center gap-1"><FiPlus size={14} /> Add</button></div>
                {form.additional_charges.map(c => (
                  <div key={c.id} className="flex gap-2 items-center"><input type="text" placeholder="Charge name" value={c.label} onChange={e => updateAdditionalCharge(c.id, 'label', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs" /><input type="number" placeholder="Amount" value={c.amount} onChange={e => updateAdditionalCharge(c.id, 'amount', Number(e.target.value))} className="w-20 border rounded px-2 py-1 text-xs text-right" /><button onClick={() => removeAdditionalCharge(c.id)} className="text-red-500"><FiX size={14} /></button></div>
                ))}
              </div>
              <div className="flex justify-between"><span>Total Taxable</span><span>₹{(itemTaxableTotal - generalDiscountAmount).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>General Discount</span><span className="text-red-500">-₹{generalDiscountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between items-center"><span>TCS %</span><input type="number" step="0.01" value={form.tcs_percent} onChange={e => setForm(prev => ({ ...prev, tcs_percent: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" /></div>
              <div className="flex justify-between"><span>TCS Amount</span><span>₹{tcsAmount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total Tax</span><span>₹{totalTax.toFixed(2)}</span></div>
              {/* Round Off with Auto toggle */}
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span>Round Off</span>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRoundOff}
                      onChange={e => setAutoRoundOff(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span>Auto</span>
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={form.round_off}
                  onChange={e => setForm(prev => ({ ...prev, round_off: Number(e.target.value) }))}
                  disabled={autoRoundOff}
                  className="w-20 text-right border rounded px-2 py-1"
                />
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
              <div className="text-xs text-gray-500 mt-1">{totalInWords}</div>

              <div className="pt-4">
                <label className="block text-sm font-medium mb-3">Payment Type</label>
                <div className="flex flex-wrap gap-2">
                  {(['credit', 'cash', 'cheque', 'online', 'bajaj_finance'] as const).map(key => (
                    <button key={key} type="button" onClick={() => setForm(prev => ({ ...prev, payment_type: key }))}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition ${form.payment_type === key ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-offset-1 ring-current/20' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >{key === 'credit' ? <FiCreditCard size={16} /> : key === 'cash' ? <FiDollarSign size={16} /> : key === 'cheque' ? <FiFileText size={16} /> : key === 'online' ? <FiGlobe size={16} /> : <FiDollarSign size={16} />}{key === 'bajaj_finance' ? 'Bajaj Finance' : key.charAt(0).toUpperCase() + key.slice(1)}</button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div><label className="block text-xs font-medium">Payment Received</label><input type="number" value={form.payment_received} onChange={e => setForm(prev => ({ ...prev, payment_received: Number(e.target.value) }))} className={inputClass} /></div>
                <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.keep_advance} onChange={e => setForm(prev => ({ ...prev, keep_advance: e.target.checked }))} />Keep as Advance</label></div>
              </div>
              <div className="flex justify-between font-medium mt-1"><span className="text-sm">Balance Due</span><span className={`text-sm ${grandTotal - form.payment_received > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>₹{(grandTotal - form.payment_received).toFixed(2)}</span></div>
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

      {/* Add Customer Offcanvas */}
      {showCustomerOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showCustomerOffcanvas}
            title="Add Customer"
            onClose={() => setShowCustomerOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowCustomerOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50">Close</button>
                <button onClick={createCustomer} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">Create Customer</button>
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
                    <select value={newCustomer.type} onChange={e => setNewCustomer(prev => ({ ...prev, type: e.target.value }))} className={inputClass}>
                      <option value="customer">Customer</option>
                      <option value="vendor">Vendor</option>
                      <option value="dealer">Dealer</option>
                      <option value="distributor">Distributor</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Company *</label>
                      <select value={newCustomer.company_id} onChange={e => setNewCustomer(prev => ({ ...prev, company_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Branch</label>
                      <select value={newCustomer.branch_id} onChange={e => setNewCustomer(prev => ({ ...prev, branch_id: e.target.value }))} className={inputClass}>
                        <option value="">None</option>
                        {availableBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">GSTIN</label>
                    <div className="flex gap-2">
                      <input type="text" value={newCustomer.gst_number} onChange={e => setNewCustomer(prev => ({ ...prev, gst_number: e.target.value }))} className={inputClass} placeholder="Enter GSTIN" />
                      <button type="button" className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600">Auto Fill</button>
                    </div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Company Name *</label><input type="text" value={newCustomer.name} onChange={e => setNewCustomer(prev => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="Enter Company Name" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Contact Person</label><input type="text" value={newCustomer.contact_person} onChange={e => setNewCustomer(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} placeholder="Enter Contact Person" /></div>
                    <div><label className="block text-sm font-medium mb-1">Contact No</label><input type="text" value={newCustomer.contact_no} onChange={e => setNewCustomer(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} placeholder="Enter Contact No" /></div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" value={newCustomer.email} onChange={e => setNewCustomer(prev => ({ ...prev, email: e.target.value }))} className={inputClass} placeholder="Enter Email" /></div>
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
                  <div><label className="block text-sm font-medium mb-1">PAN</label><input type="text" value={newCustomer.pan} onChange={e => setNewCustomer(prev => ({ ...prev, pan: e.target.value }))} className={inputClass} placeholder="Enter PAN" /></div>
                </div>
              </fieldset>

              {/* Billing Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Billing Address</legend>
                <div className="mt-3 space-y-4">
                  <div><label className="block text-sm font-medium mb-1">Address</label><textarea rows={2} value={newCustomer.billing_street} onChange={e => setNewCustomer(prev => ({ ...prev, billing_street: e.target.value }))} className={inputClass} placeholder="Enter Address" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">City *</label><input type="text" value={newCustomer.billing_city} onChange={e => setNewCustomer(prev => ({ ...prev, billing_city: e.target.value }))} className={inputClass} placeholder="Enter City" /></div>
                    <div><label className="block text-sm font-medium mb-1">State</label><input type="text" value={newCustomer.billing_state} onChange={e => setNewCustomer(prev => ({ ...prev, billing_state: e.target.value }))} className={inputClass} placeholder="Enter State" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Country</label><input type="text" value={newCustomer.billing_country} onChange={e => setNewCustomer(prev => ({ ...prev, billing_country: e.target.value }))} className={inputClass} placeholder="Country" /></div>
                    <div><label className="block text-sm font-medium mb-1">Pincode</label><input type="text" value={newCustomer.billing_pincode} onChange={e => setNewCustomer(prev => ({ ...prev, billing_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" /></div>
                  </div>
                </div>
              </fieldset>

              {/* Shipping Address */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span> Shipping Address</legend>
                <div className="mt-3">
                  <label className="flex items-center gap-2 cursor-pointer mb-3">
                    <input type="checkbox" checked={newCustomer.same_as_billing} onChange={e => setNewCustomer(prev => ({ ...prev, same_as_billing: e.target.checked }))} className="rounded border-gray-300 text-blue-600" />
                    <span className="text-sm text-gray-600">Same as Billing Address</span>
                  </label>
                  {!newCustomer.same_as_billing && (
                    <div className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">Address</label><textarea rows={2} value={newCustomer.shipping_street} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_street: e.target.value }))} className={inputClass} placeholder="Enter Address" /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium mb-1">City</label><input type="text" value={newCustomer.shipping_city} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_city: e.target.value }))} className={inputClass} placeholder="Enter City" /></div>
                        <div><label className="block text-sm font-medium mb-1">State</label><input type="text" value={newCustomer.shipping_state} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_state: e.target.value }))} className={inputClass} placeholder="Enter State" /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-medium mb-1">Country</label><input type="text" value={newCustomer.shipping_country} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_country: e.target.value }))} className={inputClass} placeholder="Country" /></div>
                        <div><label className="block text-sm font-medium mb-1">Pincode</label><input type="text" value={newCustomer.shipping_pincode} onChange={e => setNewCustomer(prev => ({ ...prev, shipping_pincode: e.target.value }))} className={inputClass} placeholder="Enter Pincode" /></div>
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
                      <select value={newCustomer.group_id} onChange={e => setNewCustomer(prev => ({ ...prev, group_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Group</option>
                      </select>
                    </div>
                    <button type="button" className="mb-0.5 text-blue-600 text-sm hover:underline whitespace-nowrap">+ Add Group</button>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Opening Balance</label><input type="number" value={newCustomer.opening_balance} onChange={e => setNewCustomer(prev => ({ ...prev, opening_balance: Number(e.target.value) }))} className={inputClass} placeholder="Enter Opening Balance" /></div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Credit</label>
                    <div className="flex items-center gap-2"><span className="text-gray-500">₹</span><input type="number" value={newCustomer.credit_limit} onChange={e => setNewCustomer(prev => ({ ...prev, credit_limit: Number(e.target.value) }))} className={inputClass} placeholder="0" /><span className="text-xs text-slate-500">(You pay the customer)</span></div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Due Days</label><input type="number" value={newCustomer.due_days} onChange={e => setNewCustomer(prev => ({ ...prev, due_days: Number(e.target.value) }))} className={inputClass} placeholder="Enter Due Days" /></div>
                </div>
              </fieldset>

              {/* Custom Fields */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Custom Fields</legend>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div><label className="block text-sm font-medium mb-1">License No.</label><input type="text" value={newCustomer.license_no} onChange={e => setNewCustomer(prev => ({ ...prev, license_no: e.target.value }))} className={inputClass} placeholder="Enter License No." /></div>
                  <div><label className="block text-sm font-medium mb-1">Custom Field 1</label><input type="text" value={newCustomer.custom_field_1} onChange={e => setNewCustomer(prev => ({ ...prev, custom_field_1: e.target.value }))} className={inputClass} placeholder="Enter Custom Field 1" /></div>
                  <div><label className="block text-sm font-medium mb-1">Custom Field 2</label><input type="text" value={newCustomer.custom_field_2} onChange={e => setNewCustomer(prev => ({ ...prev, custom_field_2: e.target.value }))} className={inputClass} placeholder="Enter Custom Field 2" /></div>
                </div>
              </fieldset>

              {/* Additional Details */}
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Additional Details</legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-medium mb-1">Fax No</label><input type="text" value={newCustomer.fax} onChange={e => setNewCustomer(prev => ({ ...prev, fax: e.target.value }))} className={inputClass} placeholder="Enter Fax No" /></div>
                    <div><label className="block text-sm font-medium mb-1">Website</label><input type="text" value={newCustomer.website} onChange={e => setNewCustomer(prev => ({ ...prev, website: e.target.value }))} className={inputClass} placeholder="Enter Website" /></div>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">Credit Limit</label><input type="number" value={newCustomer.credit_limit} onChange={e => setNewCustomer(prev => ({ ...prev, credit_limit: Number(e.target.value) }))} className={inputClass} placeholder="Enter Credit Limit" /></div>
                  <div><label className="block text-sm font-medium mb-1">Note</label><textarea rows={2} value={newCustomer.note} onChange={e => setNewCustomer(prev => ({ ...prev, note: e.target.value }))} className={inputClass} placeholder="Enter Note" /></div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={newCustomer.is_active} onChange={e => setNewCustomer(prev => ({ ...prev, is_active: e.target.checked }))} className="rounded border-gray-300 text-blue-600" />
                    <label className="text-sm text-gray-700">Enable – Company will be visible on all documents</label>
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
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}