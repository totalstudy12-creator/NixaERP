import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building,
  CheckCircle,
  Clock,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  User,
  X,
  Search,
  Package,
  Tag,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';

/* ============================================================
 * Types
 * ========================================================== */
interface QuotationLineItem {
  uid: string; // stable client-side key
  product_id?: number | null;
  item_name: string;
  description?: string;
  hsn_code?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  gst_slab: number;
  is_inter_state: boolean;
  stock_quantity?: number | null;
  unit?: string;
  sku?: string;
}

interface MetaState {
  quotation_number: string;
  company_id: string;
  branch_id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  shipping_address: string;
  gstin: string;
  pan: string;
  quotation_date: string;
  valid_until: string;
  status: string;
  notes: string;
  terms_and_conditions: string;
}

interface ChargesState {
  shipping_charges: number;
  other_charges: number;
  round_off: number;
}

type FieldErrors = Partial<Record<keyof MetaState | 'items', string>>;

/* ============================================================
 * Constants
 * ========================================================== */
const GST_SLABS = [0, 5, 12, 18, 28] as const;

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+]?[\d\s\-()]{7,20}$/;

const MAX_TEXT = 500;
const MAX_NOTES = 2000;
const PRODUCT_SELECT_LIMIT = 500;
const SEARCH_DEBOUNCE_MS = 250;

/* ============================================================
 * Utility (stable, outside component)
 * ========================================================== */
const newUid = () =>
  `li_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const emptyItem = (): QuotationLineItem => ({
  uid: newUid(),
  product_id: null,
  item_name: '',
  description: '',
  hsn_code: '',
  quantity: 1,
  unit_price: 0,
  discount_percent: 0,
  discount_amount: 0,
  gst_slab: 18,
  is_inter_state: false,
});

const formatMoney = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);

const safeNum = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const clampStr = (v: unknown, max: number): string =>
  String(v ?? '').slice(0, max);

const pickProductPrice = (p: any): number =>
  safeNum(p?.sale_price ?? p?.price ?? p?.unit_price ?? p?.selling_price ?? 0);

const pickProductTax = (p: any): number => safeNum(p?.tax_rate ?? 18);

const pickProductHsn = (p: any): string =>
  String(p?.hsn_code ?? p?.hsn_sac_code ?? '');

/* ============================================================
 * Validation
 * ========================================================== */
function validateMeta(meta: MetaState): FieldErrors {
  const e: FieldErrors = {};
  if (!meta.quotation_number.trim()) e.quotation_number = 'Quotation number is required';
  if (!meta.company_id) e.company_id = 'Company is required';
  if (!meta.branch_id) e.branch_id = 'Branch is required';
  if (!meta.customer_name.trim()) e.customer_name = 'Customer name is required';
  if (meta.customer_email && !EMAIL_REGEX.test(meta.customer_email))
    e.customer_email = 'Invalid email format';
  if (meta.customer_phone && !PHONE_REGEX.test(meta.customer_phone))
    e.customer_phone = 'Invalid phone format';
  if (meta.gstin && !GSTIN_REGEX.test(meta.gstin.toUpperCase()))
    e.gstin = 'Invalid GSTIN (15 chars, e.g. 27AAAAA0000A1Z5)';
  if (meta.pan && !PAN_REGEX.test(meta.pan.toUpperCase()))
    e.pan = 'Invalid PAN (10 chars, e.g. ABCDE1234F)';
  if (!meta.quotation_date) e.quotation_date = 'Date is required';
  if (
    meta.valid_until &&
    meta.quotation_date &&
    new Date(meta.valid_until) < new Date(meta.quotation_date)
  )
    e.valid_until = 'Valid-until must be on or after quotation date';
  return e;
}

function validateItems(items: QuotationLineItem[]): string | null {
  if (items.length === 0) return 'At least one line item is required';
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it.item_name.trim()) return `Row ${i + 1}: item name is required`;
    if (!Number.isFinite(it.quantity) || it.quantity <= 0)
      return `Row ${i + 1}: quantity must be greater than 0`;
    if (it.unit_price < 0) return `Row ${i + 1}: rate cannot be negative`;
    if (it.discount_percent < 0 || it.discount_percent > 100)
      return `Row ${i + 1}: discount must be between 0 and 100`;
    if (it.hsn_code && it.hsn_code.length > 8)
      return `Row ${i + 1}: HSN code looks too long`;
  }
  return null;
}

/* ============================================================
 * Hooks
 * ========================================================== */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ============================================================
 * Toast
 * ========================================================== */
type Toast = { id: number; type: 'success' | 'error' | 'info'; message: string };

/* ============================================================
 * Main Component
 * ========================================================== */
export function CreateQuotationPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);
  const user = useAuthStore((s) => s.user);

  /* ---- Loading / saving / errors ---- */
  const [loadingInitial, setLoadingInitial] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((type: Toast['type'], message: string) => {
    const t: Toast = { id: Date.now() + Math.random(), type, message };
    setToasts((prev) => [...prev, t]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 4500);
  }, []);

  /* ---- Auxiliary lists ---- */
  const [branches, setBranches] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  /* ---- Split state: meta / items / charges (perf) ---- */
  const [meta, setMeta] = useState<MetaState>(() => ({
    quotation_number: '',
    company_id: (user as any)?.company_id ? String((user as any).company_id) : '',
    branch_id: (user as any)?.branch_id ? String((user as any).branch_id) : '',
    customer_id: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    billing_address: '',
    shipping_address: '',
    gstin: '',
    pan: '',
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    status: 'draft',
    notes: '',
    terms_and_conditions:
      '1. Quotation valid for 30 days from date of issue.\n2. Goods once sold will not be taken back without prior authorization.\n3. Payment terms as agreed upon invoice generation.',
  }));
  const [items, setItems] = useState<QuotationLineItem[]>([emptyItem()]);
  const [charges, setCharges] = useState<ChargesState>({
    shipping_charges: 0,
    other_charges: 0,
    round_off: 0,
  });

  /* ---- Dirty tracking ---- */
  const snapshotRef = useRef<string>('');
  useEffect(() => {
    if (!loadingInitial) {
      snapshotRef.current = JSON.stringify({ meta, items, charges });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingInitial]);
  const isDirty = useMemo(() => {
    if (!snapshotRef.current) return false;
    return JSON.stringify({ meta, items, charges }) !== snapshotRef.current;
  }, [meta, items, charges]);

  /* ---- beforeunload ---- */
  useEffect(() => {
    if (!isDirty || saving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, saving]);

  /* ---- Load auxiliary data ---- */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const [b, c, cu, p] = await Promise.all([
          apiClient.getBranches(1),
          apiClient.getCompanies(),
          apiClient.getAllCustomers().catch(() => apiClient.getCustomers(1)),
          apiClient.getAllProducts().catch(() => apiClient.getProducts(1)),
        ]);
        if (controller.signal.aborted) return;
        const bList = Array.isArray(b) ? b : (b as any)?.data || [];
        const cList = Array.isArray(c) ? c : (c as any)?.data || [];
        const cuList = Array.isArray(cu) ? cu : (cu as any)?.data || [];
        const pList = Array.isArray(p) ? p : (p as any)?.data || [];
        setBranches(bList);
        setCompanies(cList);
        setCustomers(cuList);
        setProducts(pList);

        if (!isEditing) {
          setMeta((prev) => ({
            ...prev,
            company_id: prev.company_id || (cList[0]?.id ? String(cList[0].id) : ''),
            branch_id: prev.branch_id || (bList[0]?.id ? String(bList[0].id) : ''),
          }));
          try {
            const next: any = await apiClient.getNextQuotationNumber();
            if (!controller.signal.aborted && next?.next_quotation_number) {
              setMeta((prev) => ({
                ...prev,
                quotation_number: next.next_quotation_number,
              }));
            }
          } catch {
            /* non-fatal */
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error('Aux data load failed', err);
          pushToast('error', 'Could not load some form data. You can still create a quotation.');
        }
      }
    })();
    return () => controller.abort();
  }, [isEditing, pushToast]);

  /* ---- Load quotation for edit ---- */
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    (async () => {
      setLoadingInitial(true);
      try {
        const res: any = await apiClient.getQuotation(Number(id));
        if (controller.signal.aborted) return;
        const q = res?.data || res;
        if (!q) throw new Error('Quotation not found');
        if (q.status === 'converted') {
          pushToast('error', 'This quotation was converted to an invoice and cannot be edited.');
          setTimeout(() => navigate(`/quotations/${q.id}`), 1500);
          return;
        }
        setMeta({
          quotation_number: q.quotation_number || '',
          company_id: q.company_id ? String(q.company_id) : '',
          branch_id: q.branch_id ? String(q.branch_id) : '',
          customer_id: q.customer_id ? String(q.customer_id) : '',
          customer_name: q.customer_name || '',
          customer_email: q.customer_email || '',
          customer_phone: q.customer_phone || '',
          billing_address: q.billing_address || '',
          shipping_address: q.shipping_address || '',
          gstin: q.gstin || '',
          pan: q.pan || '',
          quotation_date: q.quotation_date?.slice(0, 10) || '',
          valid_until: q.valid_until?.slice(0, 10) || '',
          status: q.status || 'draft',
          notes: q.notes || '',
          terms_and_conditions: q.terms_and_conditions || '',
        });
        setCharges({
          shipping_charges: safeNum(q.shipping_charges),
          other_charges: safeNum(q.other_charges),
          round_off: safeNum(q.round_off),
        });
        setItems(
          (q.items || []).map((it: any) => ({
            uid: newUid(),
            product_id: it.product_id ?? null,
            item_name: it.item_name || '',
            description: it.description || '',
            hsn_code: it.hsn_code || '',
            quantity: safeNum(it.quantity) || 1,
            unit_price: safeNum(it.unit_price),
            discount_percent: safeNum(it.discount_percent),
            discount_amount: safeNum(it.discount_amount),
            gst_slab: safeNum(it.gst_slab) || 18,
            is_inter_state: Boolean(it.is_inter_state),
          })),
        );
        if (!q.items || q.items.length === 0) setItems([emptyItem()]);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          pushToast('error', err?.message || 'Could not load quotation');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingInitial(false);
      }
    })();
    return () => controller.abort();
  }, [id, navigate, pushToast]);

  /* ---- Stable updaters ---- */
  const updateMeta = useCallback(<K extends keyof MetaState>(key: K, value: MetaState[K]) => {
    setMeta((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const updateCharge = useCallback(<K extends keyof ChargesState>(key: K, value: number) => {
    setCharges((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  }, []);

  const updateItem = useCallback((idx: number, patch: Partial<QuotationLineItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }, []);

  const addItemRow = useCallback(() => {
    setItems((prev) => [...prev, emptyItem()]);
  }, []);

  const removeItemRow = useCallback((idx: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }, []);

  /* ---- Customer search state ---- */
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerHighlightIndex, setCustomerHighlightIndex] = useState(-1);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter customers by name, phone, email, gstin, city, code
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) {
      return customers.slice(0, 15);
    }
    return customers
      .filter((c) => {
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || c.contact_no || c.mobile || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const gstin = (c.gst_number || c.gstin || '').toLowerCase();
        const city = (c.billing_city || c.city || '').toLowerCase();
        const code = (c.customer_code || c.code || '').toLowerCase();
        return (
          name.includes(q) ||
          phone.includes(q) ||
          email.includes(q) ||
          gstin.includes(q) ||
          city.includes(q) ||
          code.includes(q)
        );
      })
      .slice(0, 25);
  }, [customers, customerSearch]);

  // Synchronize customer search text when meta.customer_id is set
  useEffect(() => {
    if (meta.customer_id && customers.length > 0) {
      const c = customers.find((cust) => String(cust.id) === String(meta.customer_id));
      if (c && !customerSearch) {
        setCustomerSearch(c.name || '');
      }
    }
  }, [meta.customer_id, customers, customerSearch]);

  const handleSelectCustomer = useCallback(
    (cust: any) => {
      if (!cust) {
        updateMeta('customer_id', '');
        setCustomerSearch('');
        return;
      }
      const billing = [cust.billing_street, cust.billing_city, cust.billing_state]
        .filter(Boolean)
        .join(', ');
      const shipping = [cust.shipping_street, cust.shipping_city, cust.shipping_state]
        .filter(Boolean)
        .join(', ');
      setMeta((prev) => ({
        ...prev,
        customer_id: String(cust.id),
        customer_name: cust.name || '',
        customer_email: cust.email || '',
        customer_phone: cust.phone || cust.contact_no || cust.mobile || '',
        branch_id: cust.branch_id ? String(cust.branch_id) : prev.branch_id,
        billing_address: billing || cust.address || '',
        shipping_address: shipping || billing || cust.address || '',
        gstin: cust.gst_number || cust.gstin || '',
        pan: cust.pan || cust.pan_number || '',
      }));
      setCustomerSearch(cust.name || '');
      setShowCustomerDropdown(false);
      setCustomerHighlightIndex(-1);
    },
    [updateMeta],
  );

  const handleClearCustomer = useCallback(() => {
    updateMeta('customer_id', '');
    setCustomerSearch('');
    setShowCustomerDropdown(false);
  }, [updateMeta]);

  /* ---- Customer fast-select fallback ---- */
  const handleCustomerSelect = useCallback(
    (customerIdStr: string) => {
      if (!customerIdStr) {
        handleClearCustomer();
        return;
      }
      const cust = customers.find((c) => String(c.id) === customerIdStr);
      if (cust) {
        handleSelectCustomer(cust);
      }
    },
    [customers, handleClearCustomer, handleSelectCustomer],
  );

  /* ---- Product fast-add from search ---- */
  const handleSelectProductFromSearch = useCallback((prod: any) => {
    if (!prod) return;
    const row: QuotationLineItem = {
      uid: newUid(),
      product_id: prod.id,
      item_name: prod.name || '',
      description: prod.description || '',
      hsn_code: pickProductHsn(prod),
      quantity: 1,
      unit_price: pickProductPrice(prod),
      discount_percent: 0,
      discount_amount: 0,
      gst_slab: pickProductTax(prod),
      is_inter_state: false,
      stock_quantity: prod.stock_quantity ?? 0,
      unit: prod.unit || 'pcs',
      sku: prod.sku || '',
    };
    setItems((prev) => {
      const lastIdx = prev.length - 1;
      const lastBlank =
        lastIdx >= 0 &&
        !prev[lastIdx].product_id &&
        !prev[lastIdx].item_name.trim() &&
        prev[lastIdx].unit_price === 0;
      if (lastBlank) {
        const next = [...prev];
        next[lastIdx] = row;
        return next;
      }
      return [...prev, row];
    });
  }, []);

  /* ---- Product select inside a row ---- */
  const handleProductSelect = useCallback(
    (index: number, productIdStr: string) => {
      const pId = productIdStr ? Number(productIdStr) : null;
      const prod = pId ? products.find((p) => p.id === pId) : null;
      if (!prod) {
        updateItem(index, { product_id: null, stock_quantity: null });
        return;
      }
      updateItem(index, {
        product_id: prod.id,
        item_name: prod.name || '',
        unit_price: pickProductPrice(prod),
        hsn_code: pickProductHsn(prod),
        gst_slab: pickProductTax(prod),
        stock_quantity: prod.stock_quantity ?? 0,
        unit: prod.unit || 'pcs',
        sku: prod.sku || '',
      });
    },
    [products, updateItem],
  );

  /* ---- Debounced search ---- */
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const debouncedQuery = useDebouncedValue(catalogSearch, SEARCH_DEBOUNCE_MS);

  const filteredProducts = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    const out: any[] = [];
    for (const p of products) {
      const name = (p.name || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();
      const barcode = (p.barcode || '').toLowerCase();
      const brand = (p.brand || '').toLowerCase();
      if (name.includes(q) || sku.includes(q) || barcode.includes(q) || brand.includes(q)) {
        out.push(p);
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [products, debouncedQuery]);

  /* ---- Branch filter ---- */
  const filteredBranches = useMemo(() => {
    if (!meta.company_id) return branches;
    const list = branches.filter(
      (b) => !b.company_id || String(b.company_id) === String(meta.company_id),
    );
    return list.length > 0 ? list : branches;
  }, [branches, meta.company_id]);

  /* ---- Calculated totals (depends on items + charges only) ---- */
  const totals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    for (const it of items) {
      const gross = safeNum(it.quantity) * safeNum(it.unit_price);
      let disc = safeNum(it.discount_amount);
      if (it.discount_percent > 0) disc = (gross * safeNum(it.discount_percent)) / 100;
      disc = Math.min(Math.max(0, disc), gross);
      const taxBase = Math.max(0, gross - disc);
      const slab = safeNum(it.gst_slab);

      subtotal += gross;
      discount += disc;
      taxable += taxBase;

      if (slab > 0) {
        if (it.is_inter_state) igst += (taxBase * slab) / 100;
        else {
          cgst += (taxBase * (slab / 2)) / 100;
          sgst += (taxBase * (slab / 2)) / 100;
        }
      }
    }

    const tax = cgst + sgst + igst;
    const grand =
      taxable +
      tax +
      safeNum(charges.shipping_charges) +
      safeNum(charges.other_charges) +
      safeNum(charges.round_off);
    return { subtotal, discount, taxable, cgst, sgst, igst, tax, grand };
  }, [items, charges]);

  /* ---- Save ---- */
  const handleSubmit = useCallback(
    async (targetStatus?: string) => {
      const mErr = validateMeta(meta);
      const itemErr = validateItems(items);
      if (Object.keys(mErr).length > 0 || itemErr) {
        setFieldErrors({ ...mErr, ...(itemErr ? { items: itemErr } : {}) });
        pushToast('error', itemErr || 'Please fix the highlighted fields.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setSaving(true);
      setFieldErrors({});
      try {
        const payload: any = {
          ...meta,
          company_id: meta.company_id || companies[0]?.id || 1,
          branch_id: meta.branch_id ? Number(meta.branch_id) : null,
          status: targetStatus || meta.status || 'draft',
          shipping_charges: safeNum(charges.shipping_charges),
          other_charges: safeNum(charges.other_charges),
          round_off: safeNum(charges.round_off),
          items: items.map((it) => ({
            product_id: it.product_id ?? null,
            item_name: it.item_name.trim(),
            description: it.description?.trim() || '',
            hsn_code: it.hsn_code?.trim() || '',
            quantity: safeNum(it.quantity),
            unit_price: safeNum(it.unit_price),
            discount_percent: safeNum(it.discount_percent),
            discount_amount: safeNum(it.discount_amount),
            gst_slab: safeNum(it.gst_slab),
            is_inter_state: Boolean(it.is_inter_state),
          })),
        };
        let quoteId: string | number | undefined = id;
        if (isEditing) {
          await apiClient.updateQuotation(Number(id), payload);
        } else {
          const res: any = await apiClient.createQuotation(payload);
          quoteId = res?.data?.id || res?.id;
        }
        snapshotRef.current = JSON.stringify({ meta, items, charges });
        pushToast('success', isEditing ? 'Quotation updated' : 'Quotation created');
        setTimeout(() => {
          navigate(quoteId ? `/quotations/${quoteId}` : '/quotations');
        }, 400);
      } catch (err: any) {
        pushToast('error', err?.message || 'Failed to save quotation.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } finally {
        setSaving(false);
      }
    },
    [meta, items, charges, companies, isEditing, id, navigate, pushToast],
  );

  /* ---- Keyboard shortcut: Ctrl/Cmd+S ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!saving) void handleSubmit('draft');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSubmit, saving]);

  /* ---- Navigation guard for back button ---- */
  const handleBack = useCallback(() => {
    if (isDirty && !saving) {
      if (!window.confirm('You have unsaved changes. Discard and leave?')) return;
    }
    navigate('/quotations');
  }, [isDirty, saving, navigate]);

  /* ---- Loading skeleton ---- */
  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-slate-50/60 p-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-16 rounded-2xl bg-white" />
          <div className="h-32 rounded-2xl bg-white" />
          <div className="h-32 rounded-2xl bg-white" />
          <div className="h-64 rounded-2xl bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-28">
      {/* Toasts */}
      <div className="pointer-events-none fixed right-4 top-20 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg animate-slide-in ${
              t.type === 'success'
                ? 'border-emerald-200 bg-white text-emerald-800'
                : t.type === 'info'
                  ? 'border-blue-200 bg-white text-blue-800'
                  : 'border-rose-200 bg-white text-rose-800'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-emerald-600" />
            ) : t.type === 'info' ? (
              <Info size={16} className="mt-0.5 flex-shrink-0 text-blue-600" />
            ) : (
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-rose-600" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="text-slate-400 transition hover:text-slate-600"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100"
              aria-label="Back to quotations"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-indigo-600">
                  Sales Document
                </span>
                <span className="text-slate-300">/</span>
                <span className="truncate text-slate-500">
                  {isEditing ? `Edit ${meta.quotation_number || ''}` : 'New Proposal'}
                </span>
              </div>
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {isEditing ? `Edit Quotation` : 'Create New Quotation'}
              </h1>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {isDirty && !saving && (
              <span className="hidden items-center gap-1 text-[11px] font-medium text-amber-600 sm:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit('draft')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Save size={14} />
              <span className="hidden sm:inline">Save Draft</span>
              <span className="sm:hidden">Draft</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit('sent')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="hidden sm:inline">Save &amp; Send</span>
              <span className="sm:hidden">Send</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {/* Section 1: Context */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeading
            icon={<Building size={16} className="text-indigo-600" />}
            title="Quotation Context & Company / Branch"
            hint="Required fields marked *"
          />
          <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Quotation Number *" error={fieldErrors.quotation_number}>
              <input
                value={meta.quotation_number}
                onChange={(e) =>
                  updateMeta('quotation_number', clampStr(e.target.value, 40).toUpperCase())
                }
                placeholder="QT-2026-0001"
                className="field-input font-mono font-bold"
              />
            </Field>

            <Field label="Company *" error={fieldErrors.company_id}>
              <select
                value={meta.company_id}
                onChange={(e) => {
                  const compId = e.target.value;
                  const match = branches.filter(
                    (b) => !b.company_id || String(b.company_id) === String(compId),
                  );
                  setMeta((prev) => ({
                    ...prev,
                    company_id: compId,
                    branch_id: match.length > 0 ? String(match[0].id) : '',
                  }));
                }}
                className="field-input"
              >
                <option value="">-- Choose Company --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Branch *" error={fieldErrors.branch_id}>
              <select
                value={meta.branch_id}
                onChange={(e) => updateMeta('branch_id', e.target.value)}
                className="field-input"
              >
                <option value="">-- Choose Branch --</option>
                {filteredBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code || 'BR'})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Quotation Date *" error={fieldErrors.quotation_date}>
              <input
                type="date"
                value={meta.quotation_date}
                onChange={(e) => updateMeta('quotation_date', e.target.value)}
                className="field-input"
              />
            </Field>

            <Field label="Valid Until" error={fieldErrors.valid_until}>
              <input
                type="date"
                value={meta.valid_until}
                onChange={(e) => updateMeta('valid_until', e.target.value)}
                className="field-input"
              />
            </Field>
          </div>
        </section>

        {/* Section 2: Customer */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionHeading icon={<User size={16} className="text-indigo-600" />} title="Customer & Billing" />
          <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Select Existing Customer" className="sm:col-span-2">
              <div ref={customerDropdownRef} className="relative">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                      setCustomerHighlightIndex(-1);
                      if (meta.customer_id && e.target.value !== meta.customer_name) {
                        updateMeta('customer_id', '');
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onKeyDown={(e) => {
                      if (!showCustomerDropdown || filteredCustomers.length === 0) return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setCustomerHighlightIndex((prev) => (prev + 1) % filteredCustomers.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setCustomerHighlightIndex((prev) =>
                          prev <= 0 ? filteredCustomers.length - 1 : prev - 1,
                        );
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (customerHighlightIndex >= 0 && customerHighlightIndex < filteredCustomers.length) {
                          handleSelectCustomer(filteredCustomers[customerHighlightIndex]);
                        } else if (filteredCustomers.length > 0) {
                          handleSelectCustomer(filteredCustomers[0]);
                        }
                      } else if (e.key === 'Escape') {
                        setShowCustomerDropdown(false);
                      }
                    }}
                    placeholder="Search customer by name, phone, email, GSTIN, city..."
                    className="field-input pl-8 pr-20"
                  />

                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                    {meta.customer_id ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                        <CheckCircle size={10} /> Linked
                      </span>
                    ) : null}
                    {customerSearch && (
                      <button
                        type="button"
                        onClick={handleClearCustomer}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                        title="Clear customer search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Customer Search Dropdown */}
                {showCustomerDropdown && (
                  <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl divide-y divide-slate-100">
                    <div className="bg-slate-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex justify-between items-center">
                      <span>Customer Directory ({filteredCustomers.length})</span>
                      {customerSearch ? <span>Matches for &ldquo;{customerSearch}&rdquo;</span> : <span>Click to select</span>}
                    </div>

                    {filteredCustomers.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500">
                        No customers found matching &ldquo;<span className="font-semibold text-slate-700">{customerSearch}</span>&rdquo;. You can enter custom client details directly.
                      </div>
                    ) : (
                      filteredCustomers.map((c, idx) => {
                        const isHighlighted = idx === customerHighlightIndex;
                        const isSelected = String(c.id) === String(meta.customer_id);
                        const phone = c.phone || c.contact_no || c.mobile;
                        const gstin = c.gst_number || c.gstin;
                        const city = c.billing_city || c.city;

                        return (
                          <div
                            key={c.id}
                            onMouseEnter={() => setCustomerHighlightIndex(idx)}
                            onClick={() => handleSelectCustomer(c)}
                            className={`w-full text-left p-2.5 transition flex items-center justify-between gap-3 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50/90 text-indigo-900 font-medium'
                                : isHighlighted
                                ? 'bg-slate-50'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-xs text-slate-900 truncate">{c.name}</span>
                                {c.customer_group && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                                    {c.customer_group}
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-0.5">
                                    <CheckCircle size={10} /> Active
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                                {phone && <span>📞 {phone}</span>}
                                {c.email && <span>✉️ {c.email}</span>}
                                {gstin && <span className="font-mono text-slate-600">GST: {gstin}</span>}
                                {city && <span>📍 {city}</span>}
                              </div>
                            </div>

                            <span className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold bg-slate-100 hover:bg-indigo-600 hover:text-white transition text-slate-700">
                              Select
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Customer Name *" error={fieldErrors.customer_name}>
              <input
                value={meta.customer_name}
                onChange={(e) => updateMeta('customer_name', clampStr(e.target.value, MAX_TEXT))}
                placeholder="Full customer name"
                className="field-input"
              />
            </Field>

            <Field label="Phone / WhatsApp" error={fieldErrors.customer_phone}>
              <input
                value={meta.customer_phone}
                onChange={(e) => updateMeta('customer_phone', clampStr(e.target.value, 20))}
                placeholder="+91 98xxx xxxxx"
                className="field-input"
              />
            </Field>

            <Field label="Email" error={fieldErrors.customer_email}>
              <input
                type="email"
                value={meta.customer_email}
                onChange={(e) => updateMeta('customer_email', clampStr(e.target.value, 120))}
                placeholder="client@example.com"
                className="field-input"
              />
            </Field>

            <Field label="GSTIN" error={fieldErrors.gstin}>
              <input
                value={meta.gstin}
                onChange={(e) => updateMeta('gstin', e.target.value.toUpperCase().slice(0, 15))}
                placeholder="27AAAAA0000A1Z5"
                className="field-input font-mono"
              />
            </Field>

            <Field label="PAN" error={fieldErrors.pan}>
              <input
                value={meta.pan}
                onChange={(e) => updateMeta('pan', e.target.value.toUpperCase().slice(0, 10))}
                placeholder="ABCDE1234F"
                className="field-input font-mono"
              />
            </Field>

            <Field label="Billing Address" className="sm:col-span-2">
              <input
                value={meta.billing_address}
                onChange={(e) => updateMeta('billing_address', clampStr(e.target.value, MAX_TEXT))}
                placeholder="Street, city, state, pin"
                className="field-input"
              />
            </Field>
          </div>
        </section>

        {/* Section 3: Items */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-indigo-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Line Items</h2>
                <p className="text-[11px] text-slate-500">
                  Search the catalog to add items with live stock &amp; prices.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={addItemRow}
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 sm:self-auto"
            >
              <Plus size={14} /> Add Line
            </button>
          </div>

          {fieldErrors.items && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertCircle size={14} /> {fieldErrors.items}
            </div>
          )}

          {/* Catalog search */}
          <div className="relative">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value);
                  setShowDropdown(true);
                  setHighlight(-1);
                }}
                onFocus={() => catalogSearch.trim() && setShowDropdown(true)}
                onKeyDown={(e) => {
                  if (!showDropdown || filteredProducts.length === 0) {
                    if (e.key === 'Escape') setShowDropdown(false);
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlight((i) => (i + 1) % filteredProducts.length);
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlight((i) => (i <= 0 ? filteredProducts.length - 1 : i - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const chosen =
                      highlight >= 0 ? filteredProducts[highlight] : filteredProducts[0];
                    if (chosen) {
                      handleSelectProductFromSearch(chosen);
                      setCatalogSearch('');
                      setShowDropdown(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowDropdown(false);
                  }
                }}
                placeholder="Search products by name, SKU, barcode, or brand…"
                className="w-full rounded-xl border border-slate-300 bg-slate-50/60 py-2.5 pl-10 pr-10 text-xs shadow-inner transition focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-100 md:text-sm"
                aria-autocomplete="list"
                aria-expanded={showDropdown}
              />
              {catalogSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSearch('');
                    setShowDropdown(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {showDropdown && catalogSearch.trim() && (
              <div className="absolute left-0 right-0 z-50 mt-1.5 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
                {filteredProducts.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No products found for &ldquo;
                    <span className="font-semibold text-slate-700">{catalogSearch}</span>
                    &rdquo;. Add a custom line below instead.
                  </div>
                ) : (
                  filteredProducts.map((p, idx) => (
                    <ProductSearchRow
                      key={p.id}
                      product={p}
                      highlighted={idx === highlight}
                      onClick={() => {
                        handleSelectProductFromSearch(p);
                        setCatalogSearch('');
                        setShowDropdown(false);
                      }}
                      onHover={() => setHighlight(idx)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Items table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="w-28 px-3 py-3">HSN</th>
                  <th className="w-24 px-3 py-3">Qty</th>
                  <th className="w-28 px-3 py-3">Rate (₹)</th>
                  <th className="w-24 px-3 py-3">Disc %</th>
                  <th className="w-24 px-3 py-3">GST</th>
                  <th className="w-16 px-3 py-3 text-center">Inter</th>
                  <th className="w-32 px-4 py-3 text-right">Total</th>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, idx) => (
                  <LineItemRow
                    key={item.uid}
                    index={idx}
                    item={item}
                    products={products}
                    canRemove={items.length > 1}
                    onUpdate={updateItem}
                    onRemove={removeItemRow}
                    onProductSelect={handleProductSelect}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Notes + Summary */}
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900">Terms &amp; Remarks</h2>
            <Field label="Terms and Conditions">
              <textarea
                rows={4}
                value={meta.terms_and_conditions}
                onChange={(e) =>
                  updateMeta('terms_and_conditions', clampStr(e.target.value, MAX_NOTES))
                }
                className="field-input resize-y py-2"
              />
            </Field>
            <Field label="Internal Notes">
              <textarea
                rows={2}
                value={meta.notes}
                onChange={(e) => updateMeta('notes', clampStr(e.target.value, MAX_NOTES))}
                placeholder="Optional internal remarks"
                className="field-input resize-y py-2"
              />
            </Field>
          </div>

          <div className="sticky top-20 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-xs shadow-sm">
            <h2 className="border-b border-slate-100 pb-2 text-sm font-bold text-slate-900">
              Financial Summary
            </h2>
            <SummaryLine label="Gross Subtotal" value={formatMoney(totals.subtotal)} />
            {totals.discount > 0 && (
              <SummaryLine label="Discount" value={`- ${formatMoney(totals.discount)}`} tone="emerald" />
            )}
            <SummaryLine label="Taxable Value" value={formatMoney(totals.taxable)} bold />
            {totals.cgst > 0 && <SummaryLine label="CGST" value={formatMoney(totals.cgst)} muted />}
            {totals.sgst > 0 && <SummaryLine label="SGST" value={formatMoney(totals.sgst)} muted />}
            {totals.igst > 0 && <SummaryLine label="IGST" value={formatMoney(totals.igst)} muted />}

            <ChargeInput
              label="Shipping / Freight"
              value={charges.shipping_charges}
              onChange={(v) => updateCharge('shipping_charges', v)}
            />
            <ChargeInput
              label="Packing & Other"
              value={charges.other_charges}
              onChange={(v) => updateCharge('other_charges', v)}
            />
            <ChargeInput
              label="Round Off"
              value={charges.round_off}
              onChange={(v) => updateCharge('round_off', v)}
              allowNegative
            />

            <div className="flex items-center justify-between border-t-2 border-slate-900 pt-3 text-sm font-bold text-slate-900">
              <span>Grand Total</span>
              <span className="text-xl text-indigo-600">{formatMoney(totals.grand)}</span>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit('draft')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Save size={15} /> Save Draft
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit('sent')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-6 py-2.5 text-xs font-semibold text-white shadow-md transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {saving ? 'Saving…' : 'Save & View'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.22s ease-out; }
        .field-input {
          margin-top: 6px;
          height: 40px;
          width: 100%;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding-left: 12px;
          padding-right: 12px;
          font-size: 12px;
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .field-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 3px rgba(99,102,241,.12);
        }
        textarea.field-input { height: auto; padding-top: 8px; padding-bottom: 8px; }
      `}</style>
    </div>
  );
}

/* ============================================================
 * Subcomponents
 * ========================================================== */

function SectionHeading({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </div>
  );
}

function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block font-medium text-slate-700">{label}</label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-rose-600">
          <AlertCircle size={10} /> {error}
        </p>
      )}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  bold,
  muted,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  tone?: 'emerald';
}) {
  return (
    <div className="flex justify-between py-0.5">
      <span className={muted ? 'text-slate-500' : 'text-slate-700'}>{label}</span>
      <span
        className={`${bold ? 'font-semibold text-slate-900' : 'text-slate-700'} ${
          tone === 'emerald' ? 'text-emerald-600 font-semibold' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ChargeInput({
  label,
  value,
  onChange,
  allowNegative,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  allowNegative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-slate-600">{label}</span>
      <input
        type="number"
        step="0.01"
        min={allowNegative ? undefined : 0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-32 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-right text-xs focus:border-indigo-500 focus:bg-white focus:outline-none"
      />
    </div>
  );
}

function ProductSearchRow({
  product,
  highlighted,
  onClick,
  onHover,
}: {
  product: any;
  highlighted: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  const stock = safeNum(product.stock_quantity);
  const reorder = safeNum(product.reorder_level) || 5;
  const price = pickProductPrice(product);
  const unit = product.unit || 'pcs';
  const isOut = stock <= 0;
  const isLow = !isOut && stock <= reorder;

  return (
    <div
      onMouseEnter={onHover}
      onClick={onClick}
      role="option"
      aria-selected={highlighted}
      className={`flex cursor-pointer items-center justify-between gap-3 p-3 transition ${
        highlighted ? 'bg-indigo-50/80' : 'hover:bg-slate-50'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-slate-900">{product.name}</span>
          {product.sku && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              {product.sku}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
          {product.brand && (
            <span>
              {product.brand}
            </span>
          )}
          <span>GST {pickProductTax(product)}%</span>
          {product.unit && <span>{product.unit}</span>}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {isOut ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Out
          </span>
        ) : isLow ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {stock} {unit}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {stock} {unit}
          </span>
        )}
        <div className="text-xs font-bold text-slate-900">₹{price.toFixed(2)}</div>
        <span className="rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white">
          + Add
        </span>
      </div>
    </div>
  );
}

/* ============================================================
 * Memoized line item row
 * ========================================================== */
interface LineItemRowProps {
  index: number;
  item: QuotationLineItem;
  products: any[];
  canRemove: boolean;
  onUpdate: (idx: number, patch: Partial<QuotationLineItem>) => void;
  onRemove: (idx: number) => void;
  onProductSelect: (idx: number, productIdStr: string) => void;
}

const LineItemRow = memo(function LineItemRow({
  index,
  item,
  products,
  canRemove,
  onUpdate,
  onRemove,
  onProductSelect,
}: LineItemRowProps) {
  const gross = safeNum(item.quantity) * safeNum(item.unit_price);
  const disc = (gross * safeNum(item.discount_percent)) / 100;
  const taxable = Math.max(0, gross - disc);
  const tax = (taxable * safeNum(item.gst_slab)) / 100;
  const lineTotal = taxable + tax;

  const productMeta = useMemo(() => {
    if (!item.product_id) return null;
    const p = products.find((x) => x.id === item.product_id);
    if (!p) return null;
    const stock = item.stock_quantity ?? p.stock_quantity ?? 0;
    const unit = item.unit || p.unit || 'units';
    const catalogRate = pickProductPrice(p);
    const exceeds = safeNum(item.quantity) > stock;
    return { stock, unit, catalogRate, exceeds };
  }, [item.product_id, item.stock_quantity, item.unit, item.quantity, products]);

  const productOptions = useMemo(() => {
    if (products.length > PRODUCT_SELECT_LIMIT) return null;
    return products.map((p) => {
      const pStock = p.stock_quantity ?? 0;
      const price = pickProductPrice(p);
      return (
        <option key={p.id} value={p.id}>
          {p.name} {p.sku ? `[${p.sku}]` : ''} — ₹{price.toFixed(2)}{' '}
          {pStock <= 0 ? '(Out of stock)' : `(Stock: ${pStock})`}
        </option>
      );
    });
  }, [products]);

  return (
    <tr className="hover:bg-slate-50/50">
      <td className="space-y-1.5 px-4 py-3">
        {productOptions ? (
          <select
            value={item.product_id || ''}
            onChange={(e) => onProductSelect(index, e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs focus:border-indigo-500"
          >
            <option value="">— Choose from catalog —</option>
            {productOptions}
          </select>
        ) : (
          <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500">
            Use search above to add from {products.length.toLocaleString()} products
          </div>
        )}

        <input
          value={item.item_name}
          onChange={(e) => onUpdate(index, { item_name: clampStr(e.target.value, MAX_TEXT) })}
          placeholder="Item name"
          className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold focus:border-indigo-500 focus:outline-none"
        />

        {productMeta ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                productMeta.stock <= 0
                  ? 'border border-rose-200 bg-rose-50 text-rose-700'
                  : productMeta.exceeds
                    ? 'border border-amber-200 bg-amber-50 text-amber-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <Package size={10} /> Stock: {productMeta.stock} {productMeta.unit}
            </span>
            {productMeta.exceeds && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                <AlertTriangle size={10} className="text-amber-600" /> Exceeds stock
              </span>
            )}
            {productMeta.catalogRate > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                <Tag size={10} /> ₹{productMeta.catalogRate.toFixed(2)}
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] italic text-slate-400">Custom non-catalog item</div>
        )}
      </td>

      <td className="px-3 py-3">
        <input
          value={item.hsn_code || ''}
          onChange={(e) => onUpdate(index, { hsn_code: e.target.value.toUpperCase().slice(0, 8) })}
          placeholder="HSN/SAC"
          className="h-8 w-full rounded-lg border border-slate-200 px-2 font-mono text-xs focus:border-indigo-500 focus:outline-none"
        />
      </td>

      <td className="px-3 py-3">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={item.quantity}
          onChange={(e) => onUpdate(index, { quantity: Number(e.target.value) })}
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
        />
      </td>

      <td className="px-3 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          value={item.unit_price}
          onChange={(e) => onUpdate(index, { unit_price: Number(e.target.value) })}
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
        />
      </td>

      <td className="px-3 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          max="100"
          value={item.discount_percent}
          onChange={(e) => onUpdate(index, { discount_percent: Number(e.target.value) })}
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs focus:border-indigo-500 focus:outline-none"
        />
      </td>

      <td className="px-3 py-3">
        <select
          value={item.gst_slab}
          onChange={(e) => onUpdate(index, { gst_slab: Number(e.target.value) })}
          className="h-8 w-full rounded-lg border border-slate-200 px-2 text-xs focus:border-indigo-500"
        >
          {GST_SLABS.map((s) => (
            <option key={s} value={s}>
              {s}%
            </option>
          ))}
        </select>
      </td>

      <td className="px-3 py-3 text-center">
        <input
          type="checkbox"
          checked={item.is_inter_state}
          onChange={(e) => onUpdate(index, { is_inter_state: e.target.checked })}
          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
      </td>

      <td className="px-4 py-3 text-right font-bold text-slate-900">{formatMoney(lineTotal)}</td>

      <td className="px-2 py-3 text-center">
        <button
          type="button"
          disabled={!canRemove}
          onClick={() => onRemove(index)}
          className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={`Remove row ${index + 1}`}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
});

export default CreateQuotationPage;