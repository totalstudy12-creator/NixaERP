import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiCreditCard, FiGlobe, FiLoader
} from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

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
    const h = Math.floor(n / 100);
    const r = n % 100;
    let w = '';
    if (h > 0) w += units[h] + ' Hundred ';
    if (r === 0) return w.trim();
    if (r < 10) w += units[r];
    else if (r < 20) w += teens[r - 10];
    else { w += tens[Math.floor(r / 10)]; if (r % 10) w += ' ' + units[r % 10]; }
    return w.trim();
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

export function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  // ⭐ Fetch all customers (not just first page)
  const getCompanies = useCallback(() => apiClient.getCompanies(), []);
  const getCustomers = useCallback(() => apiClient.getAllCustomers(), []);
  const getProducts = useCallback(() => apiClient.getProducts(), []);
  const getBanks = useCallback(async () => { try { return await apiClient.request('GET', '/banks'); } catch { return []; } }, []);

  const { data: companies } = useApiCache<Company[]>('companies', getCompanies);
  const { data: customers } = useApiCache<Customer[]>('customers', getCustomers);
  const { data: products } = useApiCache<Product[]>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount[]>('banks', getBanks);

  const customersRef = useRef(customers);
  useEffect(() => { customersRef.current = customers; }, [customers]);

  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [invoiceNotFound, setInvoiceNotFound] = useState(false);

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);

  const [form, setForm] = useState<InvoiceFormData>({
    company_id: '',
    branch: 'Main Branch',
    customer_id: '',
    customer_name: '',
    billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
    shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
    same_as_billing: true,
    contact_person: '', contact_no: '',
    gstin_pan: '', reverse_charge: false, ship_to: '', place_of_supply: '',
    invoice_type: 'tax_invoice', invoice_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    challan_no: '', challan_date: '', po_no: '', po_date: '',
    lr_no: '', eway_no: '', delivery_mode: '', payment_type: 'credit',
    payment_received: 0, keep_advance: false, remarks: '', payment_term: '',
    due_date: '', bank_id: '',
    packing_charges: 0, general_discount_percent: 0, general_discount_amount: 0,
    tcs_percent: 0, round_off: 0, terms_title: 'Terms and Conditions', terms_detail: '',
    document_note: '', additional_charges: [], internal_note: '',
  });

  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // ── Load invoice data ──
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const response = await apiClient.getInvoice(Number(id));
        const inv = response.data || response;
        setForm({
          company_id: inv.company_id || '',
          branch: inv.branch || 'Main Branch',
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
          same_as_billing: inv.same_as_billing !== false,
          contact_person: inv.contact_person || '',
          contact_no: inv.contact_no || '',
          gstin_pan: inv.gstin || inv.pan || '',
          reverse_charge: inv.reverse_charge || false,
          ship_to: inv.ship_to || '',
          place_of_supply: inv.place_of_supply || '',
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
          payment_type: inv.payment_type || 'credit',
          payment_received: Number(inv.payment_received) || 0,
          keep_advance: inv.keep_advance || false,
          remarks: inv.remarks || '',
          payment_term: inv.payment_term || '',
          due_date: inv.due_date?.split('T')[0] || '',
          bank_id: inv.bank_id || '',
          packing_charges: Number(inv.packing_charges) || 0,
          general_discount_percent: Number(inv.general_discount_percent) || 0,
          general_discount_amount: Number(inv.general_discount_amount) || 0,
          tcs_percent: Number(inv.tcs_percent) || 0,
          round_off: Number(inv.round_off) || 0,
          terms_title: inv.terms_title || 'Terms and Conditions',
          terms_detail: inv.terms_detail || '',
          document_note: inv.document_note || '',
          additional_charges: inv.additional_charges || [],
          internal_note: inv.internal_note || '',
        });

        const loadedItems: InvoiceItem[] = (inv.items || []).map((it: any) => {
          const qty = Number(it.quantity ?? it.qty) || 1;
          const price = Number(it.unit_price ?? it.price) || 0;
          const slab = it.gst_slab ?? it.igst_percent ?? 0;
          const isInter = it.is_inter_state ?? (slab > 0);
          const discountType = it.discount_type || 'percent';
          const discPct = Number(it.discount_percent) || 0;
          const discAmt = Number(it.discount_amount) || 0;
          const base = qty * price;
          const discount = discountType === 'percent' ? base * (discPct / 100) : discAmt;
          const afterDiscount = base - discount;
          let cgst = 0, sgst = 0, igst = 0;
          if (isInter) {
            igst = afterDiscount * (slab / 100);
          } else {
            const half = slab / 2;
            cgst = afterDiscount * (half / 100);
            sgst = afterDiscount * (half / 100);
          }
          return {
            product_id: it.product_id,
            product_name: it.product?.name || it.product_name || `Product #${it.product_id}`,
            hsn_sac_code: it.product?.hsn_sac_code || '',
            qty,
            uom: it.product?.uom || it.uom || 'NOS',
            price,
            discount_type: discountType,
            discount_percent: discPct,
            discount_amount: discAmt,
            gst_slab: slab,
            is_inter_state: isInter,
            cgst_percent: isInter ? 0 : slab / 2,
            sgst_percent: isInter ? 0 : slab / 2,
            igst_percent: isInter ? slab : 0,
            cgst_amount: cgst,
            sgst_amount: sgst,
            igst_amount: igst,
            total: afterDiscount + cgst + sgst + igst,
          };
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

  // ── Fetch real branches ──
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

  // ── Filtered data ──
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const term = customerSearch.toLowerCase();
    return customers.filter(c => c.name.toLowerCase().includes(term) || (c.code && c.code.toLowerCase().includes(term)));
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.hsn_sac_code && p.hsn_sac_code.toLowerCase().includes(term)) ||
      (p.sku && p.sku.toLowerCase().includes(term))
    );
  }, [products, productSearch]);

  // ── Auto‑fill customer ──
  useEffect(() => {
    if (form.customer_id && customersRef.current) {
      const cust = customersRef.current.find(c => c.id === Number(form.customer_id));
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
  }, [form.customer_id]);

  // ── Item Management (unchanged) ──
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) {
      showError('Duplicate', 'Product already in list.');
      return;
    }
    const price = product.sale_price || product.price || 0;
    const newItem: InvoiceItem = {
      product_id: product.id,
      product_name: product.name,
      hsn_sac_code: product.hsn_sac_code || '',
      qty: 1,
      uom: product.uom || product.unit || 'NOS',
      price: price,
      discount_type: 'percent',
      discount_percent: 0,
      discount_amount: 0,
      gst_slab: product.igst_rate || product.tax_rate || 0,
      is_inter_state: true,
      cgst_percent: 0,
      sgst_percent: 0,
      igst_percent: product.igst_rate || product.tax_rate || 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total: 0,
    };
    const base = newItem.qty * newItem.price;
    const discount = 0;
    const afterDiscount = base - discount;
    let cgst = 0, sgst = 0, igst = 0;
    if (newItem.is_inter_state) {
      igst = afterDiscount * (newItem.gst_slab / 100);
    } else {
      const half = newItem.gst_slab / 2;
      cgst = afterDiscount * (half / 100);
      sgst = afterDiscount * (half / 100);
    }
    newItem.cgst_amount = cgst;
    newItem.sgst_amount = sgst;
    newItem.igst_amount = igst;
    newItem.total = afterDiscount + cgst + sgst + igst;
    setItems(prev => [...prev, newItem]);
    setProductSearch('');
  }, [items, showError]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: keyof InvoiceItem, value: any) => {
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
      const afterDiscount = base - discount;
      const slab = item.gst_slab || 0;
      if (item.is_inter_state) {
        item.igst_percent = slab;
        item.cgst_percent = 0;
        item.sgst_percent = 0;
        item.igst_amount = afterDiscount * (slab / 100);
        item.cgst_amount = 0;
        item.sgst_amount = 0;
      } else {
        const half = slab / 2;
        item.cgst_percent = half;
        item.sgst_percent = half;
        item.igst_percent = 0;
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

  // ── Additional Charges (unchanged) ──
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

  // ── Totals (unchanged) ──
  const itemSubtotal = useMemo(() => items.reduce((sum, i) => sum + (i.qty * i.price), 0), [items]);
  const itemDiscountTotal = useMemo(() => items.reduce((sum, i) => sum + (i.discount_amount || 0), 0), [items]);
  const itemCgstTotal = useMemo(() => items.reduce((sum, i) => sum + (i.cgst_amount || 0), 0), [items]);
  const itemSgstTotal = useMemo(() => items.reduce((sum, i) => sum + (i.sgst_amount || 0), 0), [items]);
  const itemIgstTotal = useMemo(() => items.reduce((sum, i) => sum + (i.igst_amount || 0), 0), [items]);
  const totalTax = itemCgstTotal + itemSgstTotal + itemIgstTotal;
  const itemTaxableTotal = useMemo(() => itemSubtotal - itemDiscountTotal, [itemSubtotal, itemDiscountTotal]);

  const generalDiscountAmount = useMemo(() =>
    form.general_discount_percent
      ? (itemTaxableTotal * form.general_discount_percent) / 100
      : form.general_discount_amount,
  [itemTaxableTotal, form.general_discount_percent, form.general_discount_amount]);

  const additionalChargesTotal = useMemo(() =>
    form.additional_charges.reduce((sum, c) => sum + (c.amount || 0), 0),
  [form.additional_charges]);

  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + form.packing_charges;
  const tcsAmount = useMemo(() => totalBeforeTcs * (form.tcs_percent / 100), [totalBeforeTcs, form.tcs_percent]);
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;
  const grandTotal = totalBeforeRoundOff + form.round_off;
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);

  const remainingAmount = useMemo(() => grandTotal - form.payment_received, [grandTotal, form.payment_received]);

  // ── Handlers ──
  const handleCustomerSelect = (customer: Customer) => {
    setForm(prev => ({ ...prev, customer_id: customer.id }));
    setCustomerSearch('');
  };

  const validate = (): boolean => {
    if (!form.company_id) { setErrorMsg('Select a company.'); return false; }
    if (!form.customer_id) { setErrorMsg('Select a customer.'); return false; }
    if (!form.invoice_no.trim()) { setErrorMsg('Invoice number is required.'); return false; }
    if (items.length === 0) { setErrorMsg('Add at least one product.'); return false; }
    return true;
  };

  const handleUpdate = useCallback(async () => {
    setErrorMsg(null);
    if (!validate()) return;

    const payload = {
      company_id: Number(form.company_id),
      branch: form.branch,
      customer_id: Number(form.customer_id),
      customer_name: form.customer_name,
      billing_street: form.billing_street,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_country: form.billing_country,
      billing_pincode: form.billing_pincode,
      shipping_street: form.same_as_billing ? form.billing_street : form.shipping_street,
      shipping_city: form.same_as_billing ? form.billing_city : form.shipping_city,
      shipping_state: form.same_as_billing ? form.billing_state : form.shipping_state,
      shipping_country: form.same_as_billing ? form.billing_country : form.shipping_country,
      shipping_pincode: form.same_as_billing ? form.billing_pincode : form.shipping_pincode,
      contact_person: form.contact_person,
      contact_no: form.contact_no,
      gstin: form.gstin_pan,
      pan: form.gstin_pan,
      reverse_charge: form.reverse_charge,
      ship_to: form.ship_to,
      place_of_supply: form.place_of_supply,
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
      payment_type: form.payment_type,
      payment_received: form.payment_received,
      keep_advance: form.keep_advance,
      remarks: form.remarks,
      payment_term: form.payment_term,
      due_date: form.due_date,
      bank_id: form.bank_id || null,
      packing_charges: form.packing_charges,
      general_discount_percent: form.general_discount_percent,
      general_discount_amount: generalDiscountAmount,
      tcs_percent: form.tcs_percent,
      round_off: form.round_off,
      terms_title: form.terms_title,
      terms_detail: form.terms_detail,
      document_note: form.document_note,
      internal_note: form.internal_note,
      additional_charges: form.additional_charges,
      total_amount: grandTotal,
      tax_amount: totalTax,
      discount_amount: itemDiscountTotal + generalDiscountAmount,
      status: 'pending',
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.qty,
        unit_price: i.price,
        discount_type: i.discount_type,
        discount_percent: i.discount_percent,
        discount_amount: i.discount_amount,
        gst_slab: i.gst_slab,
        is_inter_state: i.is_inter_state,
        cgst_percent: i.cgst_percent,
        sgst_percent: i.sgst_percent,
        igst_percent: i.igst_percent,
        total: i.total,
      })),
    };

    setSubmitting(true);
    try {
      await apiClient.updateInvoice(Number(id), payload);
      showSuccess('Invoice updated', `Invoice ${form.invoice_no} updated.`);
      addAppLog({ module: 'Invoices', action: 'Update', status: 'success', message: form.invoice_no });
      navigate('/invoices');
    } catch (err: any) {
      showError('Update failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [form, id, items, grandTotal, totalTax, itemDiscountTotal, generalDiscountAmount, navigate, showSuccess, showError]);

  if (loadingInvoice) return <div className="p-8 text-center">Loading invoice...</div>;
  if (invoiceNotFound) return <div className="p-8 text-center text-red-500">Invoice not found. <Link to="/invoices">Go back</Link></div>;

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition bg-white";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
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
          <button onClick={handleUpdate} disabled={submitting} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-medium text-sm flex items-center gap-2">
            <FiSave size={16} /> Update Invoice
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 animate-shake">
          <FiX size={18} /> {errorMsg}
        </div>
      )}

      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        {/* ─── CUSTOMER & INVOICE DETAILS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Customer Information */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600">
              <FiUser /> Customer Information
            </h2>
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
                <div className="relative">
                  <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customer..." className={inputClass} />
                  {customerSearch && (
                    <button className="absolute right-2 top-2 text-gray-400 hover:text-gray-600" onClick={() => setCustomerSearch('')} aria-label="Clear search"><FiX size={16} /></button>
                  )}
                  {customerSearch && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredCustomers.map(c => (
                        <div key={c.id} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => handleCustomerSelect(c)}>
                          {c.name} {c.code ? `(${c.code})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
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
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-600">
              <FiFileText /> Invoice Details
            </h2>
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
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} />
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
                <label className="block text-sm font-medium mb-1">E-Way Bill</label>
                <input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        {/* ─── ITEMS SECTION – complete original table and mobile cards ─── */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b">
            <div className="relative w-full">
              <FiSearch className="absolute left-4 top-3.5 text-gray-400 z-10" size={18} />
              <input
                type="text"
                placeholder="Search product by name, HSN or SKU and press Enter to add..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && productSearch.trim() && filteredProducts.length > 0) {
                    addItem(filteredProducts[0]);
                  }
                }}
                className="w-full pl-12 pr-4 py-3 rounded-xl border-0 bg-slate-50 text-sm focus:ring-2 focus:ring-blue-200 focus:bg-white outline-none transition"
              />
              {productSearch && (
                <button className="absolute right-3 top-3 text-gray-400 hover:text-gray-600" onClick={() => setProductSearch('')} aria-label="Clear search">
                  <FiX size={18} />
                </button>
              )}
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map(p => (
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
                      <FiBox size={40} className="mx-auto mb-3 opacity-30" />
                      No products added yet. Search above to add your first item.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                      <td className="py-2 px-3">
                        <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)}
                          className="w-full bg-transparent border-0 focus:ring-0 text-sm p-1" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }}
                          className="w-16 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        {products?.find(p => p.id === item.product_id)?.stock_quantity != null && (
                          <div className="text-xs text-gray-400 text-center -mt-0.5">
                            Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)}
                          className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                      </td>
                      <td className="py-2 px-3">
                        <input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }}
                          className="w-20 bg-transparent border-0 focus:ring-0 text-right p-1" />
                      </td>
                      <td className="py-2 px-3">
                        <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); recalcItem(idx); }}
                          className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value="percent">%</option>
                          <option value="amount">₹</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        {item.discount_type === 'percent' ? (
                          <input type="number" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); recalcItem(idx); }}
                            className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        ) : (
                          <input type="number" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); recalcItem(idx); }}
                            className="w-20 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }}
                          className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                          <option value={-1}>Custom</option>
                        </select>
                        {item.gst_slab === -1 && (
                          <input type="number" step="0.01" placeholder="%" onChange={e => {
                            const val = Number(e.target.value);
                            if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); }
                          }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer">
                          <input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }}
                            className="rounded border-gray-300" />
                          IGST
                        </label>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{(item.total || 0).toFixed(2)}</td>
                      <td className="py-2 px-3">
                        <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600" aria-label="Remove item">
                          <FiTrash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden p-4 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <FiBox size={40} className="mx-auto mb-3 opacity-30" />
                No products added yet.
              </div>
            ) : (
              items.map((item, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-gray-400">#{idx + 1}</span>
                    <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600" aria-label="Remove item"><FiTrash2 size={16} /></button>
                  </div>
                  <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm font-medium" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Qty</label>
                      <input type="number" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" />
                      {products?.find(p => p.id === item.product_id)?.stock_quantity != null && (
                        <div className="text-xs text-gray-400 mt-1">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Unit</label>
                      <input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">Price</label>
                      <input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">Disc Type</label>
                      <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs">
                        <option value="percent">%</option>
                        <option value="amount">₹</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{item.discount_type === 'percent' ? 'Discount %' : 'Discount ₹'}</label>
                    <input type="number" step="0.01" value={item.discount_type === 'percent' ? item.discount_percent : item.discount_amount}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (item.discount_type === 'percent') updateItem(idx, 'discount_percent', val);
                        else updateItem(idx, 'discount_amount', val);
                        recalcItem(idx);
                      }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">GST Slab</label>
                      <select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs">
                        <option value={0}>0%</option>
                        <option value={5}>5%</option>
                        <option value={12}>12%</option>
                        <option value={18}>18%</option>
                        <option value={28}>28%</option>
                        <option value={-1}>Custom</option>
                      </select>
                      {item.gst_slab === -1 && (
                        <input type="number" step="0.01" placeholder="%" onChange={e => {
                          const val = Number(e.target.value);
                          if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); }
                        }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs mt-1" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 flex items-center gap-1">
                        <input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded" />
                        IGST
                      </label>
                    </div>
                  </div>
                  <div className="text-right font-semibold">₹{(item.total || 0).toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ─── INVOICE INFO & SUMMARY ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} />
              </div>
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
                <label className="block text-sm font-medium mb-1">Document Note (not visible on print)</label>
                <textarea rows={2} value={form.document_note} onChange={e => setForm(prev => ({ ...prev, document_note: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 text-slate-700">Invoice Summary</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Taxable Amount</span><span className="font-medium">₹{itemTaxableTotal.toFixed(2)}</span></div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span>Additional Charges</span>
                  <button onClick={addAdditionalCharge} className="text-blue-600 text-xs flex items-center gap-1" aria-label="Add charge"><FiPlus size={14} /> Add</button>
                </div>
                {form.additional_charges.map(c => (
                  <div key={c.id} className="flex gap-2 items-center">
                    <input type="text" placeholder="Charge name" value={c.label} onChange={e => updateAdditionalCharge(c.id, 'label', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs" />
                    <input type="number" placeholder="Amount" value={c.amount} onChange={e => updateAdditionalCharge(c.id, 'amount', Number(e.target.value))} className="w-20 border rounded px-2 py-1 text-xs text-right" />
                    <button onClick={() => removeAdditionalCharge(c.id)} className="text-red-500" aria-label="Remove charge"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between"><span>Total Taxable</span><span>₹{(itemTaxableTotal - generalDiscountAmount).toFixed(2)}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium">General Discount %</label>
                  <input type="number" step="0.01" value={form.general_discount_percent} onChange={e => setForm(prev => ({ ...prev, general_discount_percent: Number(e.target.value) }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium">Or Amount</label>
                  <input type="number" step="0.01" value={form.general_discount_amount} onChange={e => setForm(prev => ({ ...prev, general_discount_amount: Number(e.target.value) }))} className={inputClass} />
                </div>
              </div>
              <div className="flex justify-between"><span>Packing Charges</span>
                <input type="number" step="0.01" value={form.packing_charges} onChange={e => setForm(prev => ({ ...prev, packing_charges: Number(e.target.value) }))} className="w-24 text-right border rounded px-2 py-1" />
              </div>
              <div className="flex justify-between"><span>General Discount</span><span className="text-red-500">-₹{generalDiscountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between items-center">
                <span>TCS %</span>
                <input type="number" step="0.01" value={form.tcs_percent} onChange={e => setForm(prev => ({ ...prev, tcs_percent: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" />
              </div>
              <div className="flex justify-between"><span>TCS Amount</span><span>₹{tcsAmount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total Tax</span><span>₹{totalTax.toFixed(2)}</span></div>
              <div className="flex justify-between items-center">
                <span>Round Off</span>
                <input type="number" step="0.01" value={form.round_off} onChange={e => setForm(prev => ({ ...prev, round_off: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" />
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
              <div className="text-xs text-gray-500 mt-1">{totalInWords}</div>

              {/* Payment Details */}
              <div className="pt-4">
                <label className="block text-sm font-medium mb-3">Payment Type</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'credit', label: 'Credit', icon: <FiCreditCard size={16} />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                    { key: 'cash', label: 'Cash', icon: <FiDollarSign size={16} />, color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                    { key: 'cheque', label: 'Cheque', icon: <FiFileText size={16} />, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
                    { key: 'online', label: 'Online', icon: <FiGlobe size={16} />, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
                    { key: 'bajaj_finance', label: 'Bajaj Finance', icon: <FiDollarSign size={16} />, color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100' },
                  ] as const).map(({ key, label, icon, color }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, payment_type: key }))}
                      className={`px-4 py-2 rounded-xl border text-sm font-medium flex items-center gap-2 transition-all ${
                        form.payment_type === key
                          ? `${color} shadow-sm ring-2 ring-offset-1 ring-current/20`
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs font-medium">Payment Received</label>
                  <input type="number" value={form.payment_received} onChange={e => setForm(prev => ({ ...prev, payment_received: Number(e.target.value) }))} className={inputClass} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.keep_advance} onChange={e => setForm(prev => ({ ...prev, keep_advance: e.target.checked }))} />
                    Keep Extra as Advance
                  </label>
                </div>
              </div>
              <div className="flex justify-between font-medium mt-1">
                <span className="text-sm">Balance Due</span>
                <span className={`text-sm ${remainingAmount > 0 ? 'text-red-600' : remainingAmount < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                  ₹{remainingAmount.toFixed(2)}
                  {remainingAmount < 0 && ' (Advance)'}
                </span>
              </div>

              <div className="mt-2">
                <label className="block text-xs font-medium">Remarks</label>
                <input type="text" value={form.remarks} onChange={e => setForm(prev => ({ ...prev, remarks: e.target.value }))} className={inputClass} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 bg-white border-t shadow-xl p-4 flex flex-wrap justify-end gap-3 z-30">
        <button onClick={() => navigate('/invoices')} className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleUpdate} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-sm flex items-center gap-2">
          <FiSave size={16} /> Update Invoice
        </button>
      </div>

      <style>{`
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        @keyframes shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}