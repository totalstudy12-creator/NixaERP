// src/pages/EditPurchaseInvoicePage.tsx
import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiSearch, FiDollarSign, FiFileText, FiCalendar, FiUser, FiBox,
  FiX, FiSave, FiGlobe, FiLoader
} from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const Offcanvas = lazy(() => import('../components/Offcanvas').then(m => ({ default: m.Offcanvas })));

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
  payment_term: string;
  due_date: string;
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
  const getProducts = useCallback(() => apiClient.getAllProducts(), []);
  const getBanks = useCallback(() => apiClient.getBankAccounts(), []);

  const { data: companies } = useApiCache<Company[]>('companies', getCompanies);
  const { data: suppliers, refresh: refreshSuppliers } = useApiCache<Supplier[]>('suppliers', getSuppliers);
  const { data: products, refresh: refreshProducts } = useApiCache<Product[]>('products', getProducts);
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
    payment_term: '',
    due_date: '',
    bank_id: '',
    packing_charges: 0,
    general_discount_percent: 0,
    general_discount_amount: 0,
    tcs_percent: 0,
    terms_title: 'Terms and Conditions',
    terms_detail: '',
    document_note: '',
    additional_charges: [],
    internal_note: '',
    payments: [],
  });

  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');

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

  // ---- Load purchase invoice by ID ----
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const response = await apiClient.getPurchase(Number(id));
        const inv = response.data || response;

        // Map existing payments
        const existingPayments: PaymentEntry[] = Array.isArray(inv.payments)
          ? inv.payments.map((p: any) => ({
              id: `existing_${p.id ?? Date.now()}`,
              amount: Number(p.amount) || 0,
              payment_method: p.payment_method || 'bank_transfer',
              reference_no: p.reference_no || '',
              transaction_date: p.transaction_date?.split('T')[0] || '',
              bank_name: p.bank_name || '',
              account_number: p.account_number || '',
              remarks: p.remarks || '',
              payment_direction: p.payment_direction || 'outward',
            }))
          : [];

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
          payment_term: inv.payment_term || '',
          due_date: inv.due_date?.split('T')[0] || '',
          bank_id: inv.bank_id || '',
          packing_charges: Number(inv.packing_charges) || 0,
          general_discount_percent: Number(inv.general_discount_percent) || 0,
          general_discount_amount: Number(inv.general_discount_amount) || 0,
          tcs_percent: Number(inv.tcs_percent) || 0,
          terms_title: inv.terms_title || 'Terms and Conditions',
          terms_detail: inv.terms_detail || '',
          document_note: inv.document_note || '',
          additional_charges: inv.additional_charges || [],
          internal_note: inv.internal_note || '',
          payments: existingPayments,
        });

        // Map items
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

  // ---- Fetch branches when company changes ----
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

  // ---- Filtered lists ----
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

  // ---- Auto-fill supplier info ----
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

  /* ========== ITEM MANAGEMENT ========== */
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
    // Recalculate
    const calculated = recalcItemInternal(newItem);
    setItems(prev => [...prev, calculated]);
    setProductSearch('');
  }, [items, showError]);

  const removeItem = useCallback((index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback((index: number, field: keyof PurchaseItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      updated[index] = recalcItemInternal(item);
      return updated;
    });
  }, []);

  // Helper to recalc a single item
  function recalcItemInternal(item: PurchaseItem): PurchaseItem {
    const base = item.qty * item.price;
    const discount = item.discount_type === 'percent'
      ? base * (item.discount_percent / 100)
      : item.discount_amount;
    const afterDiscount = base - discount;
    const slab = item.gst_slab || 0;
    let cgst = 0, sgst = 0, igst = 0;
    if (item.is_inter_state) {
      igst = afterDiscount * (slab / 100);
    } else {
      const half = slab / 2;
      cgst = afterDiscount * (half / 100);
      sgst = afterDiscount * (half / 100);
    }
    return {
      ...item,
      discount_amount: discount,
      cgst_percent: item.is_inter_state ? 0 : slab / 2,
      sgst_percent: item.is_inter_state ? 0 : slab / 2,
      igst_percent: item.is_inter_state ? slab : 0,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      total: afterDiscount + cgst + sgst + igst,
    };
  }

  const recalcItem = useCallback((index: number) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = recalcItemInternal(updated[index]);
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

  /* ========== PAYMENT MANAGEMENT ========== */
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

  /* ========== SUPPLIER & PRODUCT OFFCAVAS HANDLERS ========== */
  const openSupplierOffcanvas = () => {
    setNewSupplier(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
    }));
    setShowSupplierOffcanvas(true);
  };

  const openProductOffcanvas = () => {
    setNewProduct(prev => ({
      ...prev,
      company_id: form.company_id ? String(form.company_id) : '',
      branch_id: form.branch ? String(form.branch) : '',
    }));
    setProductFormErrors({});
    setShowProductOffcanvas(true);
  };

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
      // Reset
      setNewSupplier({
        company_id: '', name: '', contact_person: '', contact_no: '', email: '', phone: '',
        gst_number: '', pan: '', billing_street: '', billing_city: '', billing_state: '', billing_country: 'India', billing_pincode: '',
        shipping_street: '', shipping_city: '', shipping_state: '', shipping_country: 'India', shipping_pincode: '',
        same_as_billing: true, opening_balance: 0, credit_limit: 0, due_days: 0, notes: '',
      });
    } catch (err: any) {
      const errorMsg = err.validationErrors ? Object.values(err.validationErrors).flat().join(', ') : err.message;
      showError('Create failed', errorMsg);
    } finally {
      setSupplierSubmitting(false);
    }
  };

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
        company_id: '', branch_id: '', name: '', sku: '', hsn_sac_code: '', unit: 'Piece',
        sale_price: '', purchase_price: '', tax_rate: '0', stock_quantity: '0',
        reorder_level: '0', description: '',
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
      const errorMsg = err.validationErrors ? Object.values(err.validationErrors).flat().join(', ') : err.message;
      showError('Product creation failed', errorMsg);
      addAppLog({ module: 'Inventory', action: 'Create', status: 'error', message: errorMsg });
    } finally {
      setProductSubmitting(false);
    }
  };

  /* ========== SUMMARY CALCULATIONS ========== */
  const itemSubtotal = useMemo(() => items.reduce((s, i) => s + (i.qty * i.price), 0), [items]);
  const itemDiscountTotal = useMemo(() => items.reduce((s, i) => s + (i.discount_amount || 0), 0), [items]);
  const itemCgstTotal = useMemo(() => items.reduce((s, i) => s + (i.cgst_amount || 0), 0), [items]);
  const itemSgstTotal = useMemo(() => items.reduce((s, i) => s + (i.sgst_amount || 0), 0), [items]);
  const itemIgstTotal = useMemo(() => items.reduce((s, i) => s + (i.igst_amount || 0), 0), [items]);
  const totalTax = itemCgstTotal + itemSgstTotal + itemIgstTotal;
  const itemTaxableTotal = useMemo(() => itemSubtotal - itemDiscountTotal, [itemSubtotal, itemDiscountTotal]);

  // General discount: use percent if set, else amount
  const generalDiscountAmount = useMemo(() =>
    form.general_discount_percent
      ? (itemTaxableTotal * form.general_discount_percent) / 100
      : form.general_discount_amount,
  [itemTaxableTotal, form.general_discount_percent, form.general_discount_amount]);

  const additionalChargesTotal = useMemo(() => form.additional_charges.reduce((s, c) => s + (c.amount || 0), 0), [form.additional_charges]);

  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + form.packing_charges;
  const tcsAmount = useMemo(() => totalBeforeTcs * (form.tcs_percent / 100), [totalBeforeTcs, form.tcs_percent]);
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;
  const roundOff = Math.round(totalBeforeRoundOff) - totalBeforeRoundOff;
  const grandTotal = Math.round(totalBeforeRoundOff);
  const totalInWords = useMemo(() => numberToWordsINR(grandTotal), [grandTotal]);

  const totalPaid = useMemo(() => form.payments.reduce((s, p) => s + (p.amount || 0), 0), [form.payments]);
  const balanceDue = grandTotal - totalPaid;

  // Auto-update round off in form (for display only, we don't store it)
  // We will not store round_off in state; we just use the computed value in summary display.

  /* ========== VALIDATION & UPDATE ========== */
  const handleSupplierSelect = (supplier: Supplier) => {
    setForm(prev => ({ ...prev, supplier_id: supplier.id }));
    setSupplierSearch('');
  };

  const validate = () => {
    if (!form.company_id) { setErrorMsg('Select a company.'); return false; }
    if (!form.supplier_id) { setErrorMsg('Select a supplier.'); return false; }
    if (!form.invoice_no.trim()) { setErrorMsg('Purchase number is required.'); return false; }
    if (!form.place_of_supply.trim()) { setErrorMsg('Place of supply is required.'); return false; }
    if (items.length === 0) { setErrorMsg('Add at least one product.'); return false; }
    for (let i = 0; i < items.length; i++) {
      if (items[i].qty <= 0) { setErrorMsg(`Item ${i+1}: quantity must be positive.`); return false; }
      if (items[i].price < 0) { setErrorMsg(`Item ${i+1}: price cannot be negative.`); return false; }
    }
    for (const payment of form.payments) {
      if (!['inward', 'outward'].includes(payment.payment_direction)) {
        setErrorMsg('Each payment must have a valid direction (inward or outward).');
        return false;
      }
    }
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
      payment_term: form.payment_term,
      bank_id: form.bank_id || null,
      packing_charges: form.packing_charges,
      general_discount_percent: form.general_discount_percent,
      general_discount_amount: generalDiscountAmount,
      tcs_percent: form.tcs_percent,
      round_off: roundOff,   // computed round off
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

      // Create new payment records for any payments added after loading (id starts with new_)
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
            payment_direction: payment.payment_direction || 'outward',
            transaction_date: payment.transaction_date,
            bank_name: payment.bank_name,
            account_number: payment.account_number,
            ledger_reference: payment.reference_no || `PAY-${id}-${idx + 1}`,
            remarks: payment.remarks,
          })
        );
        await Promise.all(paymentPromises);
      }

      showSuccess('Purchase updated', `Purchase ${form.invoice_no} updated.`);
      addAppLog({ module: 'Purchases', action: 'Update', status: 'success', message: form.invoice_no });
      navigate('/purchases');
    } catch (err: any) {
      showError('Update failed', err.message);
    } finally {
      setSubmitting(false);
    }
  }, [form, id, items, grandTotal, totalTax, itemDiscountTotal, generalDiscountAmount, roundOff, navigate, showSuccess, showError]);

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition bg-white";

  if (loadingInvoice) return <div className="p-8 text-center">Loading purchase invoice...</div>;
  if (invoiceNotFound) return <div className="p-8 text-center text-red-500">Purchase invoice not found. <Link to="/purchases">Go back</Link></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <div className="bg-slate-950 text-white px-6 py-5 flex items-center justify-between flex-wrap gap-4 shadow-xl rounded-b-3xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FiFileText className="text-cyan-300" /> Edit Purchase Invoice
          </h1>
          <p className="text-sm text-slate-400">{form.invoice_no} | {form.invoice_date}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/purchases')} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-sm flex items-center gap-2">
            <FiArrowLeft size={16} /> Back
          </button>
          <button onClick={handleUpdate} disabled={submitting} className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-medium text-sm flex items-center gap-2">
            <FiSave size={16} /> Update Purchase
          </button>
        </div>
      </div>

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
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={e => setSupplierSearch(e.target.value)}
                      placeholder="Search supplier..."
                      className={inputClass}
                    />
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
                  <button
                    type="button"
                    onClick={openSupplierOffcanvas}
                    className="px-3 py-2 rounded-lg border text-sm text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                  >
                    Add
                  </button>
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
                        <input type="number" min="1" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); }} className="w-16 bg-transparent border-0 focus:ring-0 text-center p-1" />
                        {products?.find(p => p.id === item.product_id)?.stock_quantity != null && (
                          <div className="text-xs text-gray-400 text-center -mt-0.5">Stock: {products.find(p => p.id === item.product_id)?.stock_quantity}</div>
                        )}
                      </td>
                      <td className="py-2 px-3"><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-14 bg-transparent border-0 focus:ring-0 text-center p-1" /></td>
                      <td className="py-2 px-3"><input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); }} className="w-20 bg-transparent border-0 focus:ring-0 text-right p-1" /></td>
                      <td className="py-2 px-3">
                        <select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); }} className="bg-transparent border-0 focus:ring-0 text-center p-1 text-sm">
                          <option value="percent">%</option><option value="amount">₹</option>
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
                          <option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option>
                        </select>
                        {item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); } }} className="w-12 bg-transparent border-0 focus:ring-0 text-center p-1 ml-1" />}
                      </td>
                      <td className="py-2 px-3">
                        <label className="inline-flex items-center gap-1 text-xs cursor-pointer"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); }} className="rounded border-gray-300" />IGST</label>
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-700">₹{(item.total || 0).toFixed(2)}</td>
                      <td className="py-2 px-3"><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600" aria-label="Remove item"><FiTrash2 size={16} /></button></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards (simplified) */}
          <div className="md:hidden p-4 space-y-4">
            {items.length === 0 ? (
              <div className="text-center py-16 text-gray-400"><FiBox size={40} className="mx-auto mb-3 opacity-30" />No products added yet.</div>
            ) : items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                <div className="flex justify-between items-start"><span className="text-xs font-semibold text-gray-400">#{idx + 1}</span><button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><FiTrash2 size={16} /></button></div>
                <input type="text" value={item.product_name} onChange={e => updateItem(idx, 'product_name', e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm font-medium" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Qty</label><input type="number" value={item.qty} onChange={e => { updateItem(idx, 'qty', Number(e.target.value)); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Unit</label><input type="text" value={item.uom} onChange={e => updateItem(idx, 'uom', e.target.value)} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Price</label><input type="number" step="0.01" value={item.price} onChange={e => { updateItem(idx, 'price', Number(e.target.value)); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Disc Type</label><select value={item.discount_type} onChange={e => { updateItem(idx, 'discount_type', e.target.value as 'percent'|'amount'); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value="percent">%</option><option value="amount">₹</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">Discount %</label><input type="number" value={item.discount_percent} onChange={e => { updateItem(idx, 'discount_percent', Number(e.target.value)); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                  <div><label className="text-xs text-gray-500">Disc Amount</label><input type="number" step="0.01" value={item.discount_amount} onChange={e => { updateItem(idx, 'discount_amount', Number(e.target.value)); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs" /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500">GST Slab</label><select value={item.gst_slab} onChange={e => { updateItem(idx, 'gst_slab', Number(e.target.value)); }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs"><option value={0}>0%</option><option value={5}>5%</option><option value={12}>12%</option><option value={18}>18%</option><option value={28}>28%</option><option value={-1}>Custom</option></select>{item.gst_slab === -1 && <input type="number" step="0.01" placeholder="%" onChange={e => { const val = Number(e.target.value); if (!isNaN(val)) { updateItem(idx, 'gst_slab', val); } }} className="w-full bg-white border border-gray-200 rounded px-2 py-1 text-xs mt-1" />}</div>
                  <div className="flex items-center gap-2"><label className="text-xs text-gray-500 flex items-center gap-1"><input type="checkbox" checked={item.is_inter_state} onChange={e => { updateItem(idx, 'is_inter_state', e.target.checked); }} className="rounded" />IGST</label></div>
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
                <div><label className="block text-xs font-medium">General Discount %</label><input type="number" step="0.01" value={form.general_discount_percent} onChange={e => setForm(prev => ({ ...prev, general_discount_percent: Number(e.target.value), general_discount_amount: 0 }))} className={inputClass} /></div>
                <div><label className="block text-xs font-medium">Or Amount</label><input type="number" step="0.01" value={form.general_discount_amount} onChange={e => setForm(prev => ({ ...prev, general_discount_amount: Number(e.target.value), general_discount_percent: 0 }))} className={inputClass} /></div>
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
              <div className="flex justify-between">
                <span>Round Off</span>
                <span className="font-medium">{roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
              </div>
              <hr className="border-slate-200" />
              <div className="flex justify-between text-base font-bold text-slate-800"><span>Grand Total</span><span>₹{grandTotal.toFixed(2)}</span></div>
              <div className="text-xs text-gray-500 mt-1">{totalInWords}</div>

              {/* Default Payment Type */}
              <div className="pt-4">
                <label className="block text-sm font-medium mb-3">Default Payment Type</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: 'credit', label: 'Credit', icon: <FiDollarSign size={16} />, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' },
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

              {/* Payments Section */}
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
                            <option value="bank_transfer">Bank Transfer</option>
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
                        <div>
                          <label className="block text-xs text-gray-500">Direction *</label>
                          <select value={pay.payment_direction} onChange={e => updatePayment(pay.id, 'payment_direction', e.target.value as 'inward' | 'outward')} className="w-full border rounded px-2 py-1 text-xs">
                            <option value="outward">Outward (Pay Supplier)</option>
                            <option value="inward">Inward (Refund)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500">Bank Name</label>
                          <input type="text" value={pay.bank_name} onChange={e => updatePayment(pay.id, 'bank_name', e.target.value)} className="w-full border rounded px-2 py-1 text-xs" />
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
                  <span>₹{totalPaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mt-1 text-sm font-medium">
                  <span>Balance Due</span>
                  <span className={balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}>₹{balanceDue.toFixed(2)}</span>
                </div>
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

      {/* Supplier Offcanvas */}
      {showSupplierOffcanvas && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={showSupplierOffcanvas}
            title="Add Supplier"
            onClose={() => setShowSupplierOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full">
                <button onClick={() => setShowSupplierOffcanvas(false)} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={supplierSubmitting}>
                  Close
                </button>
                <button onClick={createSupplier} disabled={supplierSubmitting} className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
                  {supplierSubmitting ? 'Creating...' : 'Create Supplier'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Company *</label>
                    <select value={newSupplier.company_id} onChange={e => setNewSupplier(prev => ({ ...prev, company_id: e.target.value }))} className={inputClass}>
                      <option value="">Select Company</option>
                      {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Supplier Name *</label>
                    <input type="text" value={newSupplier.name} onChange={e => setNewSupplier(prev => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="e.g., ABC Traders" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact Person</label>
                      <input type="text" value={newSupplier.contact_person} onChange={e => setNewSupplier(prev => ({ ...prev, contact_person: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Contact No</label>
                      <input type="text" value={newSupplier.contact_no} onChange={e => setNewSupplier(prev => ({ ...prev, contact_no: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">GST Number</label>
                      <input type="text" value={newSupplier.gst_number} onChange={e => setNewSupplier(prev => ({ ...prev, gst_number: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">PAN</label>
                      <input type="text" value={newSupplier.pan} onChange={e => setNewSupplier(prev => ({ ...prev, pan: e.target.value }))} className={inputClass} />
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Product Offcanvas */}
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
                      <select value={newProduct.company_id} onChange={e => setNewProduct(prev => ({ ...prev, company_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Company</option>
                        {companies?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Branch</label>
                      <select value={newProduct.branch_id} onChange={e => setNewProduct(prev => ({ ...prev, branch_id: e.target.value }))} className={inputClass}>
                        <option value="">Select Branch</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Product Name *</label>
                    <input type="text" value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} className={inputClass} placeholder="e.g., Steel Rod" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Unit *</label>
                      <input type="text" value={newProduct.unit} onChange={e => setNewProduct(prev => ({ ...prev, unit: e.target.value }))} className={inputClass} placeholder="e.g., Piece, Kg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Purchase Price (₹) *</label>
                      <input type="number" step="0.01" value={newProduct.purchase_price} onChange={e => setNewProduct(prev => ({ ...prev, purchase_price: e.target.value }))} className={inputClass} placeholder="0.00" />
                    </div>
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