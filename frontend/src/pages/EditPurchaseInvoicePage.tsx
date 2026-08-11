// src/pages/EditPurchaseInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiPrinter, FiCreditCard,
  FiGlobe, FiLoader
} from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

/* ====================== TYPES ====================== */
interface Company { id: number; name: string; }
interface Branch { id: number; name: string; }
interface Supplier {
  id: number; name: string; code?: string; email?: string; phone?: string;
  gstin?: string; pan?: string; billing_address?: string; shipping_address?: string;
  contact_person?: string; state?: string;
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string;
  purchase_price?: number; sale_price?: number; tax_rate?: number; igst_rate?: number;
  stock_quantity?: number; unit?: string; sku?: string;
}
interface BankAccount { id: number; bank_name: string; account_no: string; }

interface PurchaseItem {
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

interface PurchaseFormData {
  company_id: number | '';
  branch: string;
  supplier_id: number | '';
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
  payment_received: number;
  keep_advance: boolean;
  remarks: string;
  payment_term: string;
  due_date: string;
  bank_id: number | '';
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
}

/* ============ Amount to Words ============ */
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

/* ============ API Cache Hook ============ */
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
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [key, fetcher, ttlMs]);
  useEffect(() => { fetchData(); }, [fetchData]);
  return { data, loading, error, refresh: () => fetchData(true) };
}

/* ==================== MAIN COMPONENT ==================== */
export function EditPurchaseInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const getCompanies = useCallback(() => apiClient.getCompanies(), []);
  const getSuppliers = useCallback(() => apiClient.getSuppliers(), []);
  const getProducts = useCallback(() => apiClient.getProducts(), []);
  const getBanks = useCallback(() => apiClient.getBankAccounts(), []);

  const { data: companies } = useApiCache<Company[]>('companies', getCompanies);
  const { data: suppliers } = useApiCache<Supplier[]>('suppliers', getSuppliers);
  const { data: products } = useApiCache<Product[]>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount[]>('banks', getBanks);

  const [availableBranches, setAvailableBranches] = useState<string[]>(['Main Branch']);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [invoiceNotFound, setInvoiceNotFound] = useState(false);

  const [form, setForm] = useState<PurchaseFormData>({
    company_id: '',
    branch: 'Main Branch',
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
    payment_received: 0,
    keep_advance: false,
    remarks: '',
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
  });

  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

  // Load purchase invoice by ID
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const response = await apiClient.getPurchase(Number(id));
        const inv = response.data || response;

        setForm({
          company_id: inv.company_id || '',
          branch: inv.branch || 'Main Branch',
          supplier_id: inv.supplier_id || '',
          supplier_name: inv.supplier_name || '',
          supplier_address: inv.supplier_address || '',
          contact_person: inv.contact_person || '',
          phone_no: inv.phone_no || '',
          gstin_pan: inv.gstin || inv.pan || '',
          reverse_charge: inv.reverse_charge || false,
          ship_to: inv.ship_to || '',
          place_of_supply: inv.place_of_supply || '',
          invoice_type: inv.invoice_type || 'purchase_invoice',
          invoice_no: inv.purchase_number || '',
          invoice_date: inv.purchase_date?.split('T')[0] || new Date().toISOString().split('T')[0],
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

        // Map items to our PurchaseItem structure
        const loadedItems: PurchaseItem[] = (inv.items || []).map((it: any) => {
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
        showError('Error', 'Purchase invoice not found.');
        setInvoiceNotFound(true);
        setLoadingInvoice(false);
      }
    })();
  }, [id, showError]);

  // Fetch branches when company changes (similar to create page)
  useEffect(() => {
    if (!form.company_id) {
      setAvailableBranches(['Main Branch']);
      setForm(prev => ({ ...prev, branch: 'Main Branch' }));
      return;
    }
    let cancelled = false;
    setBranchLoading(true); setBranchError(null);
    (async () => {
      try {
        const branchesData = await apiClient.getBranchesByCompany(Number(form.company_id));
        if (cancelled) return;
        const branchNames = branchesData.map((b: Branch) => b.name);
        setAvailableBranches(branchNames.length ? branchNames : ['Main Branch']);
        setForm(prev => {
          if (!branchNames.includes(prev.branch)) return { ...prev, branch: branchNames[0] || 'Main Branch' };
          return prev;
        });
      } catch (err: any) {
        if (!cancelled) { setBranchError(err.message); setAvailableBranches(['Main Branch']); }
      } finally { if (!cancelled) setBranchLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [form.company_id]);

  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    const term = supplierSearch.toLowerCase();
    return suppliers.filter(s => s.name.toLowerCase().includes(term) || (s.code && s.code.toLowerCase().includes(term)));
  }, [suppliers, supplierSearch]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = productSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      (p.hsn_sac_code && p.hsn_sac_code.toLowerCase().includes(term)) ||
      (p.sku && p.sku.toLowerCase().includes(term))
    );
  }, [products, productSearch]);

  // Auto‑fill supplier info
  useEffect(() => {
    if (form.supplier_id && suppliers) {
      const sup = suppliers.find(s => s.id === Number(form.supplier_id));
      if (sup) {
        setForm(prev => ({
          ...prev,
          supplier_name: sup.name || '',
          supplier_address: sup.billing_address || '',
          contact_person: sup.contact_person || '',
          phone_no: sup.phone || '',
          gstin_pan: sup.gstin || sup.pan || '',
          ship_to: sup.shipping_address ? 'shipping' : 'billing',
        }));
        setSupplierSearch(sup.name);
      }
    }
  }, [form.supplier_id, suppliers]);

  /* ========== ITEM MANAGEMENT (same as create) ========== */
  const addItem = useCallback((product: Product) => {
    if (items.some(item => item.product_id === product.id)) {
      showError('Duplicate', 'Product already in list.');
      return;
    }
    const price = product.purchase_price || 0;
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
      gst_slab: product.tax_rate || product.igst_rate || 0,
      is_inter_state: true,
      cgst_percent: 0,
      sgst_percent: 0,
      igst_percent: product.igst_rate || product.tax_rate || 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total: 0,
    };
    // initial calculation
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
      const afterDiscount = base - discount;
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

  /* ========== ADDITIONAL CHARGES ========== */
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

  /* ========== TOTALS ========== */
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
  const grandTotal = totalBeforeRoundOff + form.round_off;
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);

  /* ========== HANDLERS ========== */
  const handleSupplierSelect = (supplier: Supplier) => {
    setForm(prev => ({ ...prev, supplier_id: supplier.id }));
    setSupplierSearch('');
  };

  const validate = () => {
    if (!form.company_id) { setErrorMsg('Select a company.'); return false; }
    if (!form.supplier_id) { setErrorMsg('Select a supplier.'); return false; }
    if (!form.invoice_no.trim()) { setErrorMsg('Purchase number is required.'); return false; }
    if (items.length === 0) { setErrorMsg('Add at least one product.'); return false; }
    return true;
  };

  const handleUpdate = useCallback(async () => {
    setErrorMsg(null);
    if (!validate()) return;

    const payload = {
      company_id: Number(form.company_id),
      branch: form.branch,
      supplier_id: Number(form.supplier_id),
      supplier_name: form.supplier_name,
      supplier_address: form.supplier_address,
      contact_person: form.contact_person,
      phone_no: form.phone_no,
      gstin: form.gstin_pan,
      pan: form.gstin_pan,
      reverse_charge: form.reverse_charge,
      ship_to: form.ship_to,
      place_of_supply: form.place_of_supply,
      purchase_number: form.invoice_no,
      purchase_date: form.invoice_date,
      due_date: form.due_date,
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
      items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        hsn_sac_code: i.hsn_sac_code,
        quantity: i.qty,
        unit_price: i.price,
        discount_percent: i.discount_percent,
        discount_amount: i.discount_amount,
        discount_type: i.discount_type,
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
      await apiClient.updatePurchase(Number(id), payload);
      showSuccess('Purchase updated', `Purchase ${form.invoice_no} updated.`);
      addAppLog({ module: 'Purchases', action: 'Update', status: 'success', message: form.invoice_no });
      navigate('/purchases');
    } catch (err: any) {
      showError('Update failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [form, id, items, grandTotal, totalTax, itemDiscountTotal, generalDiscountAmount, navigate, showSuccess, showError]);

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition bg-white";

  if (loadingInvoice) return <div className="p-8 text-center">Loading purchase invoice...</div>;
  if (invoiceNotFound) return <div className="p-8 text-center text-red-500">Purchase invoice not found. <Link to="/purchases">Go back</Link></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {errorMsg && (
        <div className="mx-4 md:mx-8 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center gap-2">
          <FiX size={18} /> {errorMsg}
        </div>
      )}
      <div className="max-w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Supplier & Invoice Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Supplier Information */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-blue-600"><FiUser /> Supplier Information</h2>
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
                    {branchLoading ? <option>Loading branches...</option> : availableBranches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {branchLoading && <div className="absolute right-8 top-2.5"><FiLoader className="animate-spin text-gray-400" size={16} /></div>}
                </div>
                {branchError && <p className="text-xs text-red-500 mt-1">{branchError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Supplier *</label>
                <div className="relative">
                  <input type="text" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="Search supplier..." className={inputClass} />
                  {supplierSearch && (
                    <button className="absolute right-2 top-2 text-gray-400 hover:text-gray-600" onClick={() => setSupplierSearch('')} aria-label="Clear search"><FiX size={16} /></button>
                  )}
                  {supplierSearch && filteredSuppliers.length > 0 && (
                    <div className="absolute z-20 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {filteredSuppliers.map(s => (
                        <div key={s.id} className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm" onClick={() => handleSupplierSelect(s)}>
                          {s.name} {s.code ? `(${s.code})` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div><label className="block text-sm font-medium mb-1">M/S.</label><input type="text" value={form.supplier_name} onChange={e => setForm(prev => ({ ...prev, supplier_name: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Address</label><textarea rows={2} value={form.supplier_address} onChange={e => setForm(prev => ({ ...prev, supplier_address: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium mb-1">Contact Person</label><input type="text" value={form.contact_person} onChange={e => setForm(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} /></div>
                <div><label className="block text-sm font-medium mb-1">Phone No</label><input type="text" value={form.phone_no} onChange={e => setForm(prev => ({ ...prev, phone_no: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">GSTIN / PAN</label><input type="text" value={form.gstin_pan} onChange={e => setForm(prev => ({ ...prev, gstin_pan: e.target.value }))} className={inputClass} /></div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.reverse_charge} onChange={e => setForm(prev => ({ ...prev, reverse_charge: e.target.checked }))} /> Reverse Charge</label>
              </div>
              <div><label className="block text-sm font-medium mb-1">Ship To</label>
                <select value={form.ship_to} onChange={e => setForm(prev => ({ ...prev, ship_to: e.target.value }))} className={inputClass}>
                  <option value="">-- Select --</option><option value="billing">Same as Billing</option><option value="shipping">Shipping Address</option>
                </select>
              </div>
              <div><label className="block text-sm font-medium mb-1">Place of Supply *</label><input type="text" value={form.place_of_supply} onChange={e => setForm(prev => ({ ...prev, place_of_supply: e.target.value }))} className={inputClass} placeholder="State / UT" /></div>
            </div>
          </div>

          {/* Right: Invoice Details */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-indigo-600"><FiFileText /> Purchase Invoice Details</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium mb-1">Invoice Type</label>
                  <select value={form.invoice_type} onChange={e => setForm(prev => ({ ...prev, invoice_type: e.target.value as any }))} className={inputClass}>
                    <option value="purchase_invoice">Purchase Invoice</option><option value="purchase_bill">Purchase Bill</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">Invoice No. *</label><input type="text" value={form.invoice_no} onChange={e => setForm(prev => ({ ...prev, invoice_no: e.target.value }))} className={inputClass} /></div>
                <div><label className="block text-sm font-medium mb-1">Invoice Date *</label><input type="date" value={form.invoice_date} onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))} className={inputClass} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Due Date</label><input type="date" value={form.due_date} onChange={e => setForm(prev => ({ ...prev, due_date: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Challan No.</label><input type="text" value={form.challan_no} onChange={e => setForm(prev => ({ ...prev, challan_no: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">Challan Date</label><input type="date" value={form.challan_date} onChange={e => setForm(prev => ({ ...prev, challan_date: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">L.R. No.</label><input type="text" value={form.lr_no} onChange={e => setForm(prev => ({ ...prev, lr_no: e.target.value }))} className={inputClass} /></div>
              <div><label className="block text-sm font-medium mb-1">E-Way Bill</label><input type="text" value={form.eway_no} onChange={e => setForm(prev => ({ ...prev, eway_no: e.target.value }))} className={inputClass} /></div>
            </div>
          </div>
        </div>

        {/* Items Section (identical to create) */}
        <section className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b">
            <div className="relative w-full">
              <FiSearch className="absolute left-4 top-3.5 text-gray-400 z-10" size={18} />
              <input
                type="text"
                placeholder="Search product by name, HSN or SKU and press Enter to add..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && productSearch.trim() && filteredProducts.length > 0) addItem(filteredProducts[0]); }}
                className="w-full pl-12 pr-4 py-3 rounded-xl border-0 bg-slate-50 text-sm focus:ring-2 focus:ring-blue-200 focus:bg-white outline-none transition"
              />
              {productSearch && (<button className="absolute right-3 top-3 text-gray-400 hover:text-gray-600" onClick={() => setProductSearch('')} aria-label="Clear search"><FiX size={18} /></button>)}
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  {filteredProducts.slice(0, 10).map(p => (
                    <div key={p.id} className="px-4 py-3 hover:bg-blue-50 cursor-pointer text-sm flex justify-between items-center border-b last:border-0" onClick={() => addItem(p)}>
                      <div><span className="font-medium text-slate-700">{p.name}</span>{p.hsn_sac_code && <span className="ml-2 text-xs text-gray-400">HSN: {p.hsn_sac_code}</span>}</div>
                      <span className="text-gray-600 font-medium">₹{p.purchase_price || 0}</span>
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
                  <th className="py-3 px-3">Item</th><th className="py-3 px-3 text-center">Qty</th><th className="py-3 px-3 text-center">Unit</th><th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-3 text-center">Disc Type</th><th className="py-3 px-3 text-center">Discount</th><th className="py-3 px-3 text-center">GST Slab</th><th className="py-3 px-3 text-center">Inter</th><th className="py-3 px-3 text-right">Amount</th><th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-16 text-gray-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</td></tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                      <td className="py-2 px-3"><input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm p-1" /></td>
                      <td className="py-2 px-3">
                        <input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); recalcItem(idx); }} className="w-16 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        {products?.find(p => p.id === item.product_id)?.stock_quantity != null && (
                          <div className="text-xs text-gray-400 text-center -mt-0.5">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>
                        )}
                      </td>
                      <td className="py-2 px-3"><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" /></td>
                      <td className="py-2 px-3"><input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); recalcItem(idx); }} className="w-20 bg-transparent border-0 focus:ring-0 text-right p-1" /></td>
                      <td className="py-2 px-3">
                        <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value="percent">%</option><option value="amount">₹</option>
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        {item.discount_type === 'percent' ? (
                          <input type="number" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); recalcItem(idx); }} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        ) : (
                          <input type="number" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); recalcItem(idx); }} className="w-20 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); recalcItem(idx); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option>
                        </select>
                        {item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); recalcItem(idx); } }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />}
                      </td>
                      <td className="py-2 px-3">
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); recalcItem(idx); }} className="rounded border-gray-300" />IGST</label>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{(item.total || 0).toFixed(2)}</td>
                      <td className="py-2 px-3"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600" aria-label="Remove item"><FiTrash2 size={16} /></button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile Cards omitted for brevity – same pattern as create page */}
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
                <div className="flex justify-between items-center"><span>Additional Charges</span><button onClick={addAdditionalCharge} className="text-blue-600 text-xs flex items-center gap-1" aria-label="Add charge"><FiPlus size={14} /> Add</button></div>
                {form.additional_charges.map(c => (
                  <div key={c.id} className="flex gap-2 items-center">
                    <input type="text" placeholder="Charge name" value={c.label} onChange={e => updateAdditionalCharge(c.id, 'label', e.target.value)} className="flex-1 border rounded px-2 py-1 text-xs" />
                    <input type="number" placeholder="Amount" value={c.amount} onChange={e => updateAdditionalCharge(c.id, 'amount', Number(e.target.value))} className="w-20 border rounded px-2 py-1 text-xs text-right" />
                    <button onClick={() => removeAdditionalCharge(c.id)} className="text-red-500" aria-label="Remove charge"><FiX size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex justify-between"><span>Total Taxable</span><span>₹{(itemTaxableTotal - generalDiscountAmount).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>General Discount</span><span className="text-red-500">-₹{generalDiscountAmount.toFixed(2)}</span></div>
              <div className="flex justify-between items-center"><span>TCS %</span><input type="number" step="0.01" value={form.tcs_percent} onChange={e => setForm(prev => ({ ...prev, tcs_percent: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" /></div>
              <div className="flex justify-between"><span>TCS Amount</span><span>₹{tcsAmount.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total Tax</span><span>₹{totalTax.toFixed(2)}</span></div>
              <div className="flex justify-between items-center"><span>Round Off</span><input type="number" step="0.01" value={form.round_off} onChange={e => setForm(prev => ({ ...prev, round_off: Number(e.target.value) }))} className="w-20 text-right border rounded px-2 py-1" /></div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
              <div className="text-xs text-gray-500 mt-1">{totalInWords}</div>

              <div className="pt-4">
                <label className="block text-sm font-medium mb-3">Payment Type</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'credit', label: 'Credit', icon: <FiCreditCard size={16} />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
                    { key: 'cash', label: 'Cash', icon: <FiDollarSign size={16} />, color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
                    { key: 'cheque', label: 'Cheque', icon: <FiFileText size={16} />, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
                    { key: 'online', label: 'Online', icon: <FiGlobe size={16} />, color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' },
                    { key: 'bank_transfer', label: 'Bank Transfer', icon: <FiDollarSign size={16} />, color: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100' },
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
                      {icon}{label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div><label className="block text-xs font-medium">Payment Received</label><input type="number" value={form.payment_received} onChange={e => setForm(prev => ({ ...prev, payment_received: Number(e.target.value) }))} className={inputClass} /></div>
                <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.keep_advance} onChange={e => setForm(prev => ({ ...prev, keep_advance: e.target.checked }))} />Keep as Advance</label></div>
              </div>
              <div className="flex justify-between font-medium mt-1">
                <span className="text-sm">Balance Due</span>
                <span className={`text-sm ${grandTotal - form.payment_received > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>₹{(grandTotal - form.payment_received).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 bg-white border-t shadow-xl p-4 flex flex-wrap justify-end gap-3 z-30">
        <button onClick={() => navigate('/purchases')} className="px-5 py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleUpdate} disabled={submitting} className="px-5 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 text-sm flex items-center gap-2"><FiSave size={16} /> Update Purchase</button>
      </div>

      <style>{`.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; } .scrollbar-hide::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}