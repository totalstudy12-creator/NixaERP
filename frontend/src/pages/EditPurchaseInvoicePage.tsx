// src/pages/EditPurchaseInvoicePage.tsx
import {
  useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense,
  type ChangeEvent, type KeyboardEvent, type ReactNode,
} from 'react';
import {
  FiPlus, FiTrash2, FiSearch, FiFileText, FiUser, FiBox,
  FiX, FiSave, FiLoader, FiRefreshCw, FiChevronDown, FiChevronUp,
  FiChevronRight, FiCheckCircle, FiAlertCircle, FiArrowLeft, FiPackage, FiSlash,
} from 'react-icons/fi';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas })),
);

/* ────────────────────────────────────────────────────────────────────────────
 * Constants & primitives
 * ──────────────────────────────────────────────────────────────────────── */

const LIMITS = {
  NAME: 200, TEXT: 500, LONG_TEXT: 2000, SHORT: 100,
  PHONE: 15, GSTIN: 15, PAN: 10, PINCODE: 10, SKU: 64,
} as const;

const REGEX = {
  GSTIN: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  PAN: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[0-9+\-\s()]{6,20}$/,
} as const;

function safeNumber(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
function sanitizeText(s: string, maxLen: number = LIMITS.TEXT): string {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, maxLen);
}
function sanitizeDigits(s: string, maxLen: number): string {
  return s.replace(/\D+/g, '').slice(0, maxLen);
}
function makeTxnId(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TXN-${y}${m}${day}-${rnd}`;
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: number;
    response?: { status?: number };
    backendMessage?: string;
    message?: string;
  };
  if (e.status === 404 || e.response?.status === 404) return true;
  const msg = (e.backendMessage ?? e.message ?? '').toLowerCase();
  return msg.includes('not found') || msg.includes('no query results');
}

function isStockRecordNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: number;
    response?: { status?: number };
    backendMessage?: string;
    message?: string;
  };
  const status = e.status ?? e.response?.status;
  if (status !== 404) return false;
  const msg = (e.backendMessage ?? e.message ?? '').toLowerCase();
  return msg.includes('stock record') || msg.includes('no stock record');
}

function getUserFriendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  const e = error as { validationErrors?: Record<string, string[]>; message?: string };
  if (e.validationErrors) {
    const messages = Object.values(e.validationErrors).flat();
    if (messages.length) return messages.join(', ');
  }
  if (e.message && typeof e.message === 'string' && !/TypeError|Cannot read/.test(e.message)) {
    return e.message;
  }
  return fallback;
}
function formatCurrency(value: number | string | undefined | null): string {
  const n = safeNumber(value);
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────── */

interface Company { id: number; name: string }
interface Branch { id: number; name: string; company_id?: number }
interface Warehouse { id: number; name: string; branch_id?: number | null }
interface Supplier {
  id: number; name: string; code?: string; email?: string; phone?: string;
  gstin?: string; pan?: string;
  billing_street?: string; billing_city?: string; billing_state?: string;
  billing_country?: string; billing_pincode?: string;
  billing_address?: string;
  shipping_street?: string; shipping_city?: string; shipping_state?: string;
  shipping_country?: string; shipping_pincode?: string;
  shipping_address?: string;
  contact_person?: string; contact_no?: string;
  state?: string; company_id?: number;
}
interface Product {
  id: number; name: string; hsn_sac_code?: string; uom?: string;
  price?: number | string; sale_price?: number | string; purchase_price?: number | string;
  tax_rate?: number | string; igst_rate?: number | string;
  stock_quantity?: number | string; unit?: string; sku?: string; barcode?: string;
  active?: boolean | number | string;
}
interface BankAccount { id: number; bank_name: string; account_no: string }

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
  cgst_percent: number; sgst_percent: number; igst_percent: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  total: number;
}
interface AdditionalCharge { id: string; label: string; amount: number }
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
  persisted?: boolean;
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
  challan_no: string; challan_date: string;
  po_no: string; po_date: string;
  lr_no: string; eway_no: string; delivery_mode: string;
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
interface SupplierFormData {
  company_id: number | null | string;
  name: string;
  contact_person: string;
  contact_no: string;
  email: string;
  gst_number: string;
  pan: string;
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
  same_as_billing: boolean;
  opening_balance: number | string;
  credit_limit: number | string;
  due_days: number | string;
  notes: string;
  is_active: boolean;
}

type PostSaveTask = {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
  message?: string;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Pure calculations
 * ──────────────────────────────────────────────────────────────────────── */

function calculateItem(
  raw: Omit<PurchaseItem, 'cgst_percent' | 'sgst_percent' | 'igst_percent' | 'cgst_amount' | 'sgst_amount' | 'igst_amount' | 'total'>,
): PurchaseItem {
  const qty = Math.max(0, safeNumber(raw.qty));
  const price = Math.max(0, safeNumber(raw.price));
  const base = qty * price;

  const discPct = clamp(safeNumber(raw.discount_percent), 0, 100);
  const discAmt = Math.max(0, safeNumber(raw.discount_amount));

  const computedDiscount = raw.discount_type === 'percent'
    ? (base * discPct) / 100
    : Math.min(discAmt, base);

  const afterDiscount = Math.max(0, base - computedDiscount);
  const slab = clamp(safeNumber(raw.gst_slab), 0, 100);

  let cgst_amount = 0, sgst_amount = 0, igst_amount = 0;
  if (raw.is_inter_state) {
    igst_amount = (afterDiscount * slab) / 100;
  } else {
    cgst_amount = (afterDiscount * (slab / 2)) / 100;
    sgst_amount = (afterDiscount * (slab / 2)) / 100;
  }

  return {
    ...raw,
    qty, price,
    discount_percent: discPct,
    discount_amount: computedDiscount,
    gst_slab: slab,
    cgst_percent: raw.is_inter_state ? 0 : slab / 2,
    sgst_percent: raw.is_inter_state ? 0 : slab / 2,
    igst_percent: raw.is_inter_state ? slab : 0,
    cgst_amount, sgst_amount, igst_amount,
    total: afterDiscount + cgst_amount + sgst_amount + igst_amount,
  };
}

function calculateSummary(items: PurchaseItem[], form: PurchaseFormData) {
  const itemSubtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + i.discount_amount, 0);
  const cgstTotal = items.reduce((s, i) => s + i.cgst_amount, 0);
  const sgstTotal = items.reduce((s, i) => s + i.sgst_amount, 0);
  const igstTotal = items.reduce((s, i) => s + i.igst_amount, 0);
  const totalTax = cgstTotal + sgstTotal + igstTotal;
  const itemTaxableTotal = itemSubtotal - itemDiscountTotal;

  const genDiscPct = clamp(safeNumber(form.general_discount_percent), 0, 100);
  const generalDiscountAmount = genDiscPct
    ? (itemTaxableTotal * genDiscPct) / 100
    : Math.max(0, safeNumber(form.general_discount_amount));

  const additionalChargesTotal = form.additional_charges
    .reduce((s, c) => s + Math.max(0, safeNumber(c.amount)), 0);

  const packing = Math.max(0, safeNumber(form.packing_charges));
  const tcsPct = clamp(safeNumber(form.tcs_percent), 0, 100);

  const totalBeforeTcs = itemTaxableTotal - generalDiscountAmount + totalTax + additionalChargesTotal + packing;
  const tcsAmount = (totalBeforeTcs * tcsPct) / 100;
  const totalBeforeRoundOff = totalBeforeTcs + tcsAmount;
  const grandTotal = Math.round(totalBeforeRoundOff);
  const roundOff = grandTotal - totalBeforeRoundOff;

  const totalPaid = form.payments.reduce((s, p) => s + Math.max(0, safeNumber(p.amount)), 0);

  return {
    itemSubtotal, itemDiscountTotal, totalTax, cgstTotal, sgstTotal, igstTotal,
    itemTaxableTotal, generalDiscountAmount, additionalChargesTotal,
    totalBeforeTcs, tcsAmount, totalBeforeRoundOff, roundOff, grandTotal, totalPaid,
    balanceDue: Math.max(0, grandTotal - totalPaid),
  };
}

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
    else {
      w += tens[Math.floor(r / 10)];
      if (r % 10) w += ' ' + units[r % 10];
    }
    return w.trim();
  };
  const safe = Math.max(0, safeNumber(amount));
  if (safe === 0) return 'Zero Rupees Only';
  const rupees = Math.floor(safe);
  const paise = Math.round((safe - rupees) * 100);
  const parts: number[] = [];
  let n = rupees;
  while (n > 0) { parts.push(n % 1000); n = Math.floor(n / 1000); }
  let words = '';
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

/* ────────────────────────────────────────────────────────────────────────────
 * API cache hook
 * ──────────────────────────────────────────────────────────────────────── */

const apiCache = new Map<string, { data: unknown; timestamp: number }>();

function extractArray<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as { data?: unknown; results?: unknown };
  if (r?.data && Array.isArray(r.data)) return r.data as T[];
  if (r?.data && typeof r.data === 'object' && Array.isArray((r.data as any).data)) return (r.data as any).data as T[];
  if (r?.results && Array.isArray(r.results)) return r.results as T[];
  if (r?.data && typeof r.data === 'object' && Array.isArray((r.data as any).results)) return (r.data as any).results as T[];
  return [];
}

function useApiCache<T>(key: string, fetcher: () => Promise<unknown>, ttlMs = 300_000) {
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      const entry = apiCache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        setData(entry.data as T[]);
        setLoading(false);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcher();
      const result = extractArray<T>(res);
      apiCache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err) {
      console.error('API error:', err);
      setError('Unable to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [key, fetcher, ttlMs]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return { data, loading, error, refresh: () => fetchData(true) };
}

/* ────────────────────────────────────────────────────────────────────────────
 * UI primitives
 * ──────────────────────────────────────────────────────────────────────── */

const inputBase =
  'w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 ' +
  'placeholder:text-slate-400 outline-none transition ' +
  'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ' +
  'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed';
const inputError = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20';

function Field({
  label, required, error, hint, children,
}: { label?: string; required?: boolean; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-slate-600">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="text-xs text-rose-600 flex items-center gap-1"><FiAlertCircle size={12} />{error}</p>
        : hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean; onChange: (v: boolean) => void;
  label: string; description?: string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition ${
      disabled ? 'opacity-60' : 'hover:border-slate-300 cursor-pointer'
    }`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => { e.preventDefault(); if (!disabled) onChange(!checked); }}
        className={`relative inline-flex h-5 w-10 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-4 focus:ring-indigo-500/20 ${
          checked ? 'bg-indigo-600' : 'bg-slate-300'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  );
}

function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', destructive, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string;
  confirmLabel?: string; destructive?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      role="dialog" aria-modal="true" aria-labelledby="confirm-title"
      className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md p-6">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            destructive ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
          }`}>
            <FiAlertCircle size={20} />
          </div>
          <div className="flex-1">
            <h3 id="confirm-title" className="text-base font-semibold text-slate-800">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition ${
              destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Initial state
 * ──────────────────────────────────────────────────────────────────────── */

const DEFAULT_TERMS =
  '1. Subject to our home Jurisdiction.\n' +
  '2. Our Responsibility Ceases as soon as goods leaves our Premises.\n' +
  '3. Goods once sold will not be taken back.\n' +
  '4. Delivery Ex-Premises.\n' +
  '5. Warranty (if any) is provided by the manufacturer.\n' +
  'Jurisdiction:';

const createInitialForm = (): PurchaseFormData => ({
  company_id: '', branch: 'Main Branch', supplier_id: '', supplier_name: '',
  supplier_address: '', contact_person: '', phone_no: '', gstin_pan: '',
  reverse_charge: false, ship_to: '', place_of_supply: '',
  invoice_type: 'purchase_invoice', invoice_no: '',
  invoice_date: new Date().toISOString().slice(0, 10),
  challan_no: '', challan_date: '', po_no: '', po_date: '',
  lr_no: '', eway_no: '', delivery_mode: '',
  payment_type: 'credit', payment_term: '', due_date: '',
  bank_id: '', packing_charges: 0,
  general_discount_percent: 0, general_discount_amount: 0, tcs_percent: 0,
  terms_title: 'Terms and Conditions', terms_detail: DEFAULT_TERMS,
  document_note: '', additional_charges: [], internal_note: '', payments: [],
});

const createInitialSupplier = (): SupplierFormData => ({
  company_id: '', name: '', contact_person: '', contact_no: '', email: '',
  gst_number: '', pan: '',
  billing_street: '', billing_city: '', billing_state: '',
  billing_country: 'India', billing_pincode: '',
  shipping_street: '', shipping_city: '', shipping_state: '',
  shipping_country: 'India', shipping_pincode: '',
  same_as_billing: true, opening_balance: '', credit_limit: '', due_days: '',
  notes: '', is_active: true,
});

/* ────────────────────────────────────────────────────────────────────────────
 * Main component
 * ──────────────────────────────────────────────────────────────────────── */

export function EditPurchaseInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useNotification() as {
    showSuccess: (a: string, b?: string) => void;
    showError: (a: string, b?: string) => void;
    showInfo?: (a: string, b?: string) => void;
  };

  /* ── API fetchers ── */
  const getCompanies = useCallback(() => apiClient.getCompanies(), []);
  const getSuppliers = useCallback(() => apiClient.getSuppliers(), []);
  const getProducts = useCallback(() => apiClient.getAllProducts(), []);
  const getBanks = useCallback(async () => {
    try { return await apiClient.getBankAccounts(); } catch { return []; }
  }, []);
  const getWarehouses = useCallback(async () => {
    try { return await apiClient.request('GET', '/warehouses?per_page=all'); }
    catch { return []; }
  }, []);

  const { data: companies } = useApiCache<Company>('companies', getCompanies);
  const {
    data: suppliers, loading: suppliersLoading, error: suppliersError, refresh: refreshSuppliers,
  } = useApiCache<Supplier>('suppliers', getSuppliers);
  const {
    data: products, loading: productsLoading, error: productsError, refresh: refreshProducts,
  } = useApiCache<Product>('products', getProducts);
  const { data: banks } = useApiCache<BankAccount>('banks', getBanks);
  const { data: warehouses, refresh: refreshWarehouses } = useApiCache<Warehouse>('warehouses', getWarehouses);

  /* ── Form / item state ── */
  const [form, setForm] = useState<PurchaseFormData>(createInitialForm);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [originalItems, setOriginalItems] = useState<PurchaseItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<
    | { kind: 'changeCompany'; nextCompany: number | '' }
    | { kind: 'cancel' }
    | null
  >(null);

  /* ── Load state ── */
  const [loadingInvoice, setLoadingInvoice] = useState(true);
  const [invoiceNotFound, setInvoiceNotFound] = useState(false);

  /* ── Automation toggles ── */
  const [autoAdjustStock, setAutoAdjustStock] = useState(true);
  const [postTasks, setPostTasks] = useState<PostSaveTask[]>([]);
  const [has404Warning, setHas404Warning] = useState(false);

  /* ── Dirty tracking ── */
  const initialFormRef = useRef<string>('');
  const initialItemsRef = useRef<string>('');
  const [hydrated, setHydrated] = useState(false);
  const isDirty = useMemo(() => {
    if (!hydrated) return false;
    return JSON.stringify(form) !== initialFormRef.current
      || JSON.stringify(items) !== initialItemsRef.current;
  }, [form, items, hydrated]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  /* ── Branches (name-based for purchase flow) ── */
  const [availableBranches, setAvailableBranches] = useState<string[]>(['Main Branch']);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [branchTouched, setBranchTouched] = useState(false);

  useEffect(() => {
    if (!form.company_id) {
      setAvailableBranches(['Main Branch']);
      if (branchTouched) setForm((p) => (p.branch === 'Main Branch' ? p : { ...p, branch: 'Main Branch' }));
      return;
    }
    let cancelled = false;
    setBranchLoading(true);
    setBranchError(null);
    (async () => {
      try {
        const res = await apiClient.getBranchesByCompany(Number(form.company_id));
        if (cancelled) return;
        const list = Array.isArray(res) ? res : ((res as any)?.data ?? []);
        const names: string[] = list.map((b: Branch) => b.name);
        const finalList = names.length ? names : ['Main Branch'];
        setAvailableBranches(finalList);
        setForm((p) => (finalList.includes(p.branch) ? p : { ...p, branch: finalList[0] }));
      } catch (err) {
        if (cancelled) return;
        setBranchError(getUserFriendlyError(err, 'Unable to load branches.'));
        setAvailableBranches(['Main Branch']);
      } finally {
        if (!cancelled) setBranchLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.company_id, branchTouched]);

  /* ── Search state ── */
  const [productSearch, setProductSearch] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [productHighlight, setProductHighlight] = useState(-1);
  const [supplierHighlight, setSupplierHighlight] = useState(-1);

  /* ── Supplier creation state ── */
  const [showSupplierOffcanvas, setShowSupplierOffcanvas] = useState(false);
  const [newSupplier, setNewSupplier] = useState<SupplierFormData>(createInitialSupplier);
  const [supplierFormErrors, setSupplierFormErrors] = useState<Record<string, boolean>>({});
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);

  /* ── Product creation state ── */
  const [showProductOffcanvas, setShowProductOffcanvas] = useState(false);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [newProduct, setNewProduct] = useState({
    company_id: '', branch_id: '', name: '', sku: '', hsn_sac_code: '',
    unit: 'Piece', sale_price: '', purchase_price: '', tax_rate: '0',
    stock_quantity: '0', reorder_level: '0', description: '',
  });
  const [productFormErrors, setProductFormErrors] = useState<Record<string, boolean>>({});

  /* ── Dropdown refs ── */
  const productDropdownRef = useRef<HTMLDivElement>(null);
  const supplierDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productDropdownRef.current && !productDropdownRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
      if (supplierDropdownRef.current && !supplierDropdownRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Load existing purchase invoice ── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoadingInvoice(true);
      try {
        const response = await (apiClient as any).getPurchase(Number(id));
        const inv: any = (response as any)?.data ?? response;
        if (cancelled) return;

        const loadedForm: PurchaseFormData = {
          company_id: inv.company_id || '',
          branch: inv.branch || 'Main Branch',
          supplier_id: inv.supplier_id || '',
          supplier_name: inv.supplier_name || '',
          supplier_address: inv.supplier_address || '',
          contact_person: inv.contact_person || '',
          phone_no: inv.phone_no || '',
          gstin_pan: inv.gstin || inv.pan || '',
          reverse_charge: !!inv.reverse_charge,
          ship_to: inv.ship_to || '',
          place_of_supply: inv.place_of_supply || '',
          invoice_type: inv.invoice_type || 'purchase_invoice',
          invoice_no: inv.purchase_number || inv.invoice_no || '',
          invoice_date: inv.purchase_date?.split('T')[0] || new Date().toISOString().slice(0, 10),
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
          packing_charges: safeNumber(inv.packing_charges),
          general_discount_percent: safeNumber(inv.general_discount_percent),
          general_discount_amount: safeNumber(inv.general_discount_amount),
          tcs_percent: safeNumber(inv.tcs_percent),
          terms_title: inv.terms_title || 'Terms and Conditions',
          terms_detail: inv.terms_detail || DEFAULT_TERMS,
          document_note: inv.document_note || '',
          additional_charges: Array.isArray(inv.additional_charges)
            ? inv.additional_charges.map((c: any, i: number) => ({
                id: c.id ?? `chg-${i}`,
                label: c.label || '',
                amount: safeNumber(c.amount),
              }))
            : [],
          internal_note: inv.internal_note || '',
          payments: Array.isArray(inv.payments)
            ? inv.payments.map((p: any) => ({
                id: `existing_${p.id ?? Date.now()}`,
                amount: safeNumber(p.amount),
                payment_method: (p.payment_method as PaymentEntry['payment_method']) || 'bank_transfer',
                reference_no: p.reference_no || '',
                transaction_date: p.transaction_date?.split('T')[0] || '',
                bank_name: p.bank_name || '',
                account_number: p.account_number || '',
                remarks: p.remarks || '',
                payment_direction: (p.payment_direction as 'inward' | 'outward') || 'outward',
                persisted: true,
              }))
            : [],
        };

        const loadedItems: PurchaseItem[] = (Array.isArray(inv.items) ? inv.items : []).map((it: any) => {
          const base = {
            product_id: it.product_id,
            product_name: it.product?.name || it.product_name || `Product #${it.product_id}`,
            hsn_sac_code: it.product?.hsn_sac_code || it.hsn_sac_code || '',
            qty: safeNumber(it.quantity ?? it.qty, 1),
            uom: it.product?.uom || it.uom || 'NOS',
            price: safeNumber(it.unit_price ?? it.price),
            discount_type: (it.discount_type as 'percent' | 'amount') || 'percent',
            discount_percent: safeNumber(it.discount_percent),
            discount_amount: safeNumber(it.discount_amount),
            gst_slab: safeNumber(it.gst_slab ?? it.igst_percent ?? it.product?.igst_rate ?? it.product?.tax_rate),
            is_inter_state: it.is_inter_state ?? (safeNumber(it.gst_slab ?? it.igst_percent) > 0),
          };
          return calculateItem(base);
        });

        setForm(loadedForm);
        setItems(loadedItems);
        setOriginalItems(loadedItems.map((x) => ({ ...x })));

        queueMicrotask(() => {
          initialFormRef.current = JSON.stringify(loadedForm);
          initialItemsRef.current = JSON.stringify(loadedItems);
          setHydrated(true);
        });

        setSupplierSearch(loadedForm.supplier_name || '');
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        showError('Error', 'Purchase invoice not found.');
        setInvoiceNotFound(true);
      } finally {
        if (!cancelled) setLoadingInvoice(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, showError]);

  /* ── Derived lists ── */
  const filteredSuppliers = useMemo(() => {
    if (!suppliers) return [];
    let list = suppliers;
    if (form.company_id) {
      list = list.filter((s) => !s.company_id || s.company_id === Number(form.company_id));
    }
    const term = supplierSearch.toLowerCase().trim();
    if (!term) return list;
    return list.filter((s) =>
      s.name?.toLowerCase().includes(term) ||
      s.code?.toLowerCase().includes(term) ||
      s.gstin?.toLowerCase().includes(term) ||
      s.contact_no?.includes(term),
    );
  }, [suppliers, supplierSearch, form.company_id]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const term = productSearch.toLowerCase().trim();
    if (!term) return products;
    return products.filter((p) =>
      p.name?.toLowerCase().includes(term) ||
      p.sku?.toLowerCase().includes(term) ||
      p.barcode?.toLowerCase().includes(term) ||
      p.hsn_sac_code?.toLowerCase().includes(term),
    );
  }, [products, productSearch]);

  const summary = useMemo(() => calculateSummary(items, form), [items, form]);
  const totalInWords = useMemo(() => numberToWordsINR(summary.grandTotal), [summary.grandTotal]);

  const defaultWarehouseId = useMemo<number | null>(() => {
    if (!warehouses || warehouses.length === 0) return null;
    if (form.branch) {
      const match = warehouses.find((w) => w.name === form.branch);
      if (match) return match.id;
    }
    return warehouses[0].id;
  }, [warehouses, form.branch]);

  const productIndex = useMemo(() => {
    const map = new Map<number, Product>();
    products?.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  /* ── Auto-fill supplier info on selection change ── */
  useEffect(() => {
    if (!form.supplier_id || !suppliers) return;
    const sup = suppliers.find((s) => s.id === Number(form.supplier_id));
    if (!sup) return;
    const billingAddr = sup.billing_address
      || [sup.billing_street, sup.billing_city, sup.billing_state, sup.billing_pincode]
          .filter(Boolean).join(', ');
    setForm((p) => ({
      ...p,
      supplier_name: sup.name || '',
      supplier_address: billingAddr || p.supplier_address,
      contact_person: sup.contact_person || '',
      phone_no: sup.contact_no || sup.phone || '',
      gstin_pan: sup.gstin || sup.pan || '',
      ship_to: sup.shipping_address || sup.shipping_street ? 'shipping' : 'billing',
    }));
    setSupplierSearch(sup.name || '');
  }, [form.supplier_id, suppliers]);

  /* ── Form helpers ── */
  const updateForm = useCallback(<K extends keyof PurchaseFormData>(key: K, value: PurchaseFormData[K]) => {
    setForm((p) => ({ ...p, [key]: value }));
    setFormErrors((prev) => {
      if (!prev[key as string]) return prev;
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }, []);

  const handleCompanyChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value ? Number(e.target.value) : '';
    if (nextId === form.company_id) return;
    if (items.length > 0) {
      setConfirm({ kind: 'changeCompany', nextCompany: nextId });
      return;
    }
    setBranchTouched(true);
    setForm((p) => ({ ...p, company_id: nextId, supplier_id: '' }));
    setSupplierSearch('');
  };

  /* ── Item handlers ── */
  const addItem = useCallback((product: Product) => {
    setItems((prev) => {
      if (prev.some((i) => i.product_id === product.id)) {
        showError('Duplicate', 'Product already added.');
        return prev;
      }
      const base = {
        product_id: product.id,
        product_name: sanitizeText(product.name, LIMITS.NAME),
        hsn_sac_code: sanitizeText(product.hsn_sac_code || '', LIMITS.SHORT),
        qty: 1,
        uom: sanitizeText(product.uom || product.unit || 'NOS', 16),
        price: Math.max(0, safeNumber(product.purchase_price ?? product.price ?? product.sale_price)),
        discount_type: 'percent' as const,
        discount_percent: 0,
        discount_amount: 0,
        gst_slab: clamp(safeNumber(product.igst_rate ?? product.tax_rate), 0, 100),
        is_inter_state: true,
      };
      return [...prev, calculateItem(base)];
    });
    setProductSearch('');
    setShowProductDropdown(false);
  }, [showError]);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateItem = useCallback(<K extends keyof PurchaseItem>(index: number, field: K, value: PurchaseItem[K]) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = calculateItem({ ...copy[index], [field]: value } as any);
      return copy;
    });
  }, []);

  /* ── Additional charges ── */
  const addAdditionalCharge = () => {
    setForm((p) => ({
      ...p,
      additional_charges: [
        ...p.additional_charges,
        { id: crypto.randomUUID?.() ?? Date.now().toString(), label: '', amount: 0 },
      ],
    }));
  };
  const updateAdditionalCharge = (id: string, field: 'label' | 'amount', value: string | number) => {
    setForm((p) => ({
      ...p,
      additional_charges: p.additional_charges.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    }));
  };
  const removeAdditionalCharge = (id: string) => {
    setForm((p) => ({ ...p, additional_charges: p.additional_charges.filter((c) => c.id !== id) }));
  };

  /* ── Payments ── */
  const addPayment = () => {
    setForm((p) => ({
      ...p,
      payments: [
        ...p.payments,
        {
          id: `new_${crypto.randomUUID?.() ?? Date.now().toString()}`,
          amount: 0,
          payment_method: 'bank_transfer',
          reference_no: makeTxnId(),
          transaction_date: new Date().toISOString().slice(0, 10),
          bank_name: '',
          account_number: '',
          remarks: '',
          payment_direction: 'outward',
          persisted: false,
        },
      ],
    }));
  };
  const updatePayment = <K extends keyof PaymentEntry>(id: string, field: K, value: PaymentEntry[K]) => {
    setForm((p) => ({
      ...p,
      payments: p.payments.map((pay) => (pay.id === id ? { ...pay, [field]: value } : pay)),
    }));
  };
  const removePayment = (id: string) => {
    setForm((p) => ({ ...p, payments: p.payments.filter((x) => x.id !== id) }));
  };

  /* ── Combobox keyboard nav ── */
  const onProductKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!filteredProducts.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setProductHighlight((i) => (i + 1) % filteredProducts.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setProductHighlight((i) => (i - 1 + filteredProducts.length) % filteredProducts.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = productHighlight >= 0 ? productHighlight : 0;
      const p = filteredProducts[idx];
      if (p) addItem(p);
      setProductHighlight(-1);
    } else if (e.key === 'Escape') {
      setShowProductDropdown(false);
      setProductHighlight(-1);
    }
  };

  const onSupplierKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!filteredSuppliers.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSupplierHighlight((i) => (i + 1) % filteredSuppliers.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSupplierHighlight((i) => (i - 1 + filteredSuppliers.length) % filteredSuppliers.length); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = supplierHighlight >= 0 ? supplierHighlight : 0;
      const s = filteredSuppliers[idx];
      if (s) {
        setForm((p) => ({ ...p, supplier_id: s.id }));
        setSupplierSearch('');
        setShowSupplierDropdown(false);
        setSupplierHighlight(-1);
      }
    } else if (e.key === 'Escape') {
      setShowSupplierDropdown(false);
      setSupplierHighlight(-1);
    }
  };

  /* ── Validation ── */
  const validateMainForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.company_id) errors.company_id = 'Select a company.';
    if (!form.supplier_id) errors.supplier_id = 'Select a supplier.';
    if (!form.invoice_no.trim()) errors.invoice_no = 'Invoice number is required.';
    if (!form.place_of_supply.trim()) errors.place_of_supply = 'Place of supply is required.';
    if (items.length === 0) errors.items = 'Add at least one product.';
    if (form.gstin_pan && !REGEX.GSTIN.test(form.gstin_pan) && !REGEX.PAN.test(form.gstin_pan)) {
      errors.gstin_pan = 'Enter a valid GSTIN or PAN.';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /* ── Post-save automation — stock delta for purchase ── */
  const runPostSaveAutomation = useCallback(async (
    invoiceNo: string,
  ): Promise<{ stockErrors: string[]; notFoundIds: number[] }> => {
    const stockErrors: string[] = [];
    const notFoundIds: number[] = [];

    if (!autoAdjustStock) {
      setPostTasks([]);
      setHas404Warning(false);
      return { stockErrors, notFoundIds };
    }

    const originalMap = new Map<number, PurchaseItem>();
    originalItems.forEach((i) => originalMap.set(i.product_id, i));
    const newMap = new Map<number, PurchaseItem>();
    items.forEach((i) => newMap.set(i.product_id, i));

    type DeltaRow = { item: PurchaseItem; delta: number; kind: 'in' | 'out' };
    const deltas: DeltaRow[] = [];

    for (const it of items) {
      const orig = originalMap.get(it.product_id);
      if (!orig) {
        deltas.push({ item: it, delta: it.qty, kind: 'in' });
      } else {
        const d = it.qty - orig.qty;
        if (Math.abs(d) > 1e-9) {
          deltas.push({ item: it, delta: Math.abs(d), kind: d > 0 ? 'in' : 'out' });
        }
      }
    }
    for (const orig of originalItems) {
      if (!newMap.has(orig.product_id)) {
        deltas.push({ item: orig, delta: orig.qty, kind: 'out' });
      }
    }

    if (deltas.length === 0) {
      setPostTasks([]);
      setHas404Warning(false);
      return { stockErrors, notFoundIds };
    }

    const initialTasks: PostSaveTask[] = deltas.map((d, idx) => ({
      id: `stock-${d.item.product_id}-${idx}`,
      label: d.kind === 'in'
        ? `Stock IN · ${d.item.product_name} (+${d.delta} ${d.item.uom})`
        : `Stock OUT · ${d.item.product_name} (−${d.delta} ${d.item.uom})`,
      status: 'pending',
    }));
    setPostTasks(initialTasks);
    setHas404Warning(false);

    const setTask = (id: string, patch: Partial<PostSaveTask>) => {
      setPostTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    };

    if (!defaultWarehouseId) {
      deltas.forEach((d, idx) => {
        const id = `stock-${d.item.product_id}-${idx}`;
        setTask(id, { status: 'skipped', message: 'No warehouse available' });
        stockErrors.push(`${d.item.product_name}: no warehouse available`);
      });
      return { stockErrors, notFoundIds };
    }

    for (let i = 0; i < deltas.length; i++) {
      const d = deltas[i];
      const taskId = `stock-${d.item.product_id}-${i}`;
      setTask(taskId, { status: 'running' });

      const endpoint = d.kind === 'in'
        ? `/products/${d.item.product_id}/stock-in`
        : `/products/${d.item.product_id}/stock-out`;

      try {
        const res = await apiClient.request('POST', endpoint, {
          warehouse_id: defaultWarehouseId,
          quantity: d.delta,
          unit_price: d.item.price,
          reference_type: 'purchase',
          reference_id: invoiceNo,
          transaction_date: form.invoice_date,
          remark: `${d.kind === 'in' ? 'Auto stock-in' : 'Auto stock-out'} for purchase invoice ${invoiceNo} (edit)`,
        });

        const after = (res as any)?.data?.stock_after;
        if (typeof after === 'number' && after < 0) {
          setTask(taskId, {
            status: 'success',
            message: d.kind === 'in' ? `Added (balance ${after})` : `Removed (balance ${after})`,
          });
        } else {
          setTask(taskId, { status: 'success', message: d.kind === 'in' ? 'Added' : 'Removed' });
        }
      } catch (err) {
        if (isStockRecordNotFoundError(err)) {
          const msg = getUserFriendlyError(err, 'No stock record found for this warehouse');
          setTask(taskId, {
            status: 'error',
            message: `${msg} — backend auto-create did not run. Check ProductController::stockIn/stockOut.`,
          });
          stockErrors.push(`${d.item.product_name}: ${msg}`);
        } else if (isNotFoundError(err)) {
          notFoundIds.push(d.item.product_id);
          setTask(taskId, {
            status: 'skipped',
            message: 'Product not found (404) — cache may be stale',
          });
          stockErrors.push(`${d.item.product_name}: product not found on server`);
        } else {
          const msg = getUserFriendlyError(err, 'Stock adjustment failed');
          setTask(taskId, { status: 'error', message: msg });
          stockErrors.push(`${d.item.product_name}: ${msg}`);
        }
      }
    }

    if (stockErrors.length === 0 || notFoundIds.length > 0) {
      apiCache.delete('products');
      apiCache.delete('inventory');
    }
    if (notFoundIds.length > 0) setHas404Warning(true);

    return { stockErrors, notFoundIds };
  }, [
    autoAdjustStock, items, originalItems, defaultWarehouseId, form.invoice_date,
  ]);

  /* ── Submit — UPDATE ── */
  const handleUpdate = useCallback(async () => {
    setErrorMsg(null);

    if (!validateMainForm()) {
      showError('Validation', 'Please fix the highlighted fields.');
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('[data-error="true"]');
        el?.focus();
      });
      return;
    }

    const payload = {
      company_id: Number(form.company_id),
      branch: form.branch,
      supplier_id: Number(form.supplier_id),
      supplier_name: sanitizeText(form.supplier_name, LIMITS.NAME),
      supplier_address: sanitizeText(form.supplier_address),
      contact_person: sanitizeText(form.contact_person, LIMITS.NAME),
      phone_no: sanitizeText(form.phone_no, LIMITS.PHONE),
      gstin: form.gstin_pan,
      pan: form.gstin_pan,
      reverse_charge: form.reverse_charge,
      ship_to: sanitizeText(form.ship_to, LIMITS.SHORT),
      place_of_supply: sanitizeText(form.place_of_supply, LIMITS.SHORT),
      purchase_number: form.invoice_no.trim(),
      purchase_date: form.invoice_date,
      due_date: form.due_date,
      challan_no: sanitizeText(form.challan_no, LIMITS.SHORT),
      challan_date: form.challan_date,
      po_no: sanitizeText(form.po_no, LIMITS.SHORT),
      po_date: form.po_date,
      lr_no: sanitizeText(form.lr_no, LIMITS.SHORT),
      eway_no: sanitizeText(form.eway_no, LIMITS.SHORT),
      delivery_mode: sanitizeText(form.delivery_mode, LIMITS.SHORT),
      payment_type: form.payment_type,
      payment_term: sanitizeText(form.payment_term, LIMITS.SHORT),
      bank_id: form.bank_id || null,
      packing_charges: safeNumber(form.packing_charges),
      general_discount_percent: clamp(safeNumber(form.general_discount_percent), 0, 100),
      general_discount_amount: Math.max(0, safeNumber(form.general_discount_amount)),
      tcs_percent: clamp(safeNumber(form.tcs_percent), 0, 100),
      round_off: summary.roundOff,
      terms_title: sanitizeText(form.terms_title, LIMITS.SHORT),
      terms_detail: sanitizeText(form.terms_detail, LIMITS.LONG_TEXT),
      document_note: sanitizeText(form.document_note, LIMITS.LONG_TEXT),
      internal_note: sanitizeText(form.internal_note, LIMITS.LONG_TEXT),
      additional_charges: form.additional_charges.map((c) => ({
        label: sanitizeText(c.label, LIMITS.SHORT),
        amount: Math.max(0, safeNumber(c.amount)),
      })),
      total_amount: summary.grandTotal,
      tax_amount: summary.totalTax,
      discount_amount: summary.itemDiscountTotal + summary.generalDiscountAmount,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: sanitizeText(i.product_name, LIMITS.NAME),
        hsn_sac_code: sanitizeText(i.hsn_sac_code, LIMITS.SHORT),
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
        cgst_amount: i.cgst_amount,
        sgst_amount: i.sgst_amount,
        igst_amount: i.igst_amount,
        total: i.total,
      })),
    };

    setSubmitting(true);
    try {
      await (apiClient as any).updatePurchase(Number(id), payload);

      const validNewPayments: PaymentEntry[] = [];
      let remaining = summary.grandTotal - summary.totalPaid;
      for (const p of form.payments) {
        if (p.persisted) continue;
        if (p.amount <= 0 || remaining <= 0) continue;
        const amt = Math.min(p.amount, remaining);
        if (amt > 0) {
          validNewPayments.push({ ...p, amount: amt });
          remaining -= amt;
        }
      }

      let paymentsRecorded = 0;
      if (validNewPayments.length > 0) {
        try {
          await Promise.all(validNewPayments.map((p, idx) =>
            apiClient.request('POST', '/payments', {
              company_id: Number(form.company_id),
              invoice_id: Number(id),
              reference_no: p.reference_no || `PAY-${id}-${idx + 1}`,
              amount: p.amount,
              payment_method: p.payment_method,
              status: 'completed',
              payment_direction: p.payment_direction || 'outward',
              transaction_date: p.transaction_date,
              bank_name: p.bank_name,
              account_number: p.account_number,
              ledger_reference: p.reference_no || `PAY-${id}-${idx + 1}`,
              remarks: sanitizeText(p.remarks, LIMITS.TEXT),
            }),
          ));
          paymentsRecorded = validNewPayments.length;
        } catch (payErr) {
          const payMsg = getUserFriendlyError(payErr, 'Payment recording failed');
          addAppLog({
            module: 'Purchases', action: 'RecordPayments', status: 'error', message: payMsg,
          });
          showInfo?.(
            'Payment not recorded',
            `${payMsg} — the purchase invoice was updated. Add the payment from the invoice page.`,
          );
        }
      }

      let automationSummary = '';
      if (autoAdjustStock) {
        try {
          const { stockErrors, notFoundIds } = await runPostSaveAutomation(form.invoice_no);
          const deltaCount = postTasks.length;
          if (deltaCount > 0) {
            automationSummary = ' · ' + `${deltaCount - stockErrors.length}/${deltaCount} stock adj`;
          }

          if (notFoundIds.length > 0) {
            const unique = Array.from(new Set(notFoundIds));
            showInfo?.(
              'Automation skipped — product not found',
              `${unique.length} product${unique.length > 1 ? 's' : ''} could not be found on the server ` +
              `(IDs: ${unique.join(', ')}). The purchase was updated. Refresh the products list and re-check.`,
            );
            addAppLog({
              module: 'Purchases', action: 'PostSaveAutomation', status: 'error',
              message: `404 on product IDs: ${unique.join(', ')}`,
            });
          } else if (stockErrors.length > 0) {
            showInfo?.(
              'Stock adjustment warnings',
              `${stockErrors.length} task(s) failed. See log for details.`,
            );
            addAppLog({
              module: 'Purchases', action: 'PostSaveAutomation', status: 'error',
              message: stockErrors.join(' | ').slice(0, 500),
            });
          }
        } catch (autoErr) {
          addAppLog({
            module: 'Purchases', action: 'PostSaveAutomation', status: 'error',
            message: getUserFriendlyError(autoErr, 'Automation crashed'),
          });
        }
      }

      addAppLog({ module: 'Purchases', action: 'Update', status: 'success', message: form.invoice_no });

      showSuccess(
        'Purchase updated',
        `Purchase ${form.invoice_no} updated.${paymentsRecorded ? ' Payments recorded.' : ''}${automationSummary}`,
      );

      initialFormRef.current = JSON.stringify(form);
      initialItemsRef.current = JSON.stringify(items);
      setHydrated(false);

      if (autoAdjustStock) void refreshProducts();
      if (autoAdjustStock) await new Promise((r) => setTimeout(r, 500));

      navigate('/purchases');
    } catch (err) {
      const msg = getUserFriendlyError(err, 'Purchase invoice could not be updated.');
      setErrorMsg(msg);
      showError('Update failed', msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    form, items, id, navigate, showSuccess, showError, showInfo, summary,
    autoAdjustStock, runPostSaveAutomation, refreshProducts, postTasks.length,
  ]);

  /* ── Supplier create ── */
  const createSupplier = async () => {
    const errs: Record<string, boolean> = {};
    const name = sanitizeText(newSupplier.name, LIMITS.NAME).trim();
    const city = sanitizeText(newSupplier.billing_city, LIMITS.SHORT).trim();
    if (!name) errs.name = true;
    if (!newSupplier.company_id) errs.company_id = true;
    if (newSupplier.email && !REGEX.EMAIL.test(newSupplier.email)) errs.email = true;
    if (newSupplier.contact_no && !REGEX.PHONE.test(newSupplier.contact_no)) errs.contact_no = true;
    if (newSupplier.gst_number && !REGEX.GSTIN.test(newSupplier.gst_number)) errs.gst_number = true;
    if (newSupplier.pan && !REGEX.PAN.test(newSupplier.pan)) errs.pan = true;
    setSupplierFormErrors(errs);
    if (Object.keys(errs).length) {
      showError('Validation', 'Please fix the highlighted fields.');
      return;
    }

    const { same_as_billing: _ignored, ...rest } = newSupplier;
    const payload = {
      ...rest,
      name,
      billing_city: city || rest.billing_city,
      type: 'supplier',
      company_id: Number(newSupplier.company_id),
      opening_balance: safeNumber(newSupplier.opening_balance),
      credit_limit: newSupplier.credit_limit ? safeNumber(newSupplier.credit_limit) : null,
      due_days: newSupplier.due_days ? Number(newSupplier.due_days) : null,
    };

    setSupplierSubmitting(true);
    try {
      const created = await apiClient.createSupplier(payload as any);
      showSuccess('Supplier created', `${created.name} added.`);
      await refreshSuppliers();
      setForm((p) => ({ ...p, supplier_id: created.id }));
      setShowSupplierOffcanvas(false);
      setNewSupplier(createInitialSupplier());
    } catch (err) {
      showError('Create failed', getUserFriendlyError(err, 'Supplier creation failed.'));
    } finally {
      setSupplierSubmitting(false);
    }
  };

  /* ── Product create ── */
  const generateProductSKU = useCallback(() => {
    if (!products) return 'FU-001';
    const prefix = 'FU-';
    let max = 0;
    for (const p of products) {
      if (p.sku?.startsWith(prefix)) {
        const n = parseInt(p.sku.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
  }, [products]);

  const openProductOffcanvas = () => {
    setNewProduct((p) => ({
      ...p,
      company_id: form.company_id ? String(form.company_id) : '',
      branch_id: '',
    }));
    setProductFormErrors({});
    setShowProductOffcanvas(true);
  };

  const openSupplierOffcanvas = () => {
    setNewSupplier((p) => ({
      ...p,
      company_id: form.company_id ? String(form.company_id) : '',
    }));
    setSupplierFormErrors({});
    setShowSupplierOffcanvas(true);
  };

  const createProduct = async () => {
    const errs: Record<string, boolean> = {};
    if (!newProduct.company_id) errs.company_id = true;
    if (!newProduct.name.trim()) errs.name = true;
    if (!newProduct.purchase_price || safeNumber(newProduct.purchase_price) < 0) errs.purchase_price = true;
    if (!newProduct.unit.trim()) errs.unit = true;
    setProductFormErrors(errs);
    if (Object.keys(errs).length) {
      showError('Validation', 'Please fill in required fields.');
      return;
    }

    const sku = newProduct.sku.trim() || generateProductSKU();

    const payload = {
      company_id: Number(newProduct.company_id),
      branch_id: null,
      warehouse_id: defaultWarehouseId ?? null,
      name: sanitizeText(newProduct.name, LIMITS.NAME).trim(),
      sku: sanitizeText(sku, LIMITS.SKU),
      hsn_sac_code: sanitizeText(newProduct.hsn_sac_code, LIMITS.SHORT),
      unit: sanitizeText(newProduct.unit, 32),
      sale_price: safeNumber(newProduct.sale_price),
      purchase_price: safeNumber(newProduct.purchase_price),
      tax_rate: clamp(safeNumber(newProduct.tax_rate), 0, 100),
      stock_quantity: Math.max(0, Math.floor(safeNumber(newProduct.stock_quantity))),
      reorder_level: Math.max(0, Math.floor(safeNumber(newProduct.reorder_level))),
      description: sanitizeText(newProduct.description, LIMITS.LONG_TEXT),
      active: true,
    };

    setProductSubmitting(true);
    try {
      const created = await apiClient.createProduct(payload);
      showSuccess('Product created', `${created.name} added to catalog.`);
      await refreshProducts();
      await refreshWarehouses();
      setShowProductOffcanvas(false);
      setNewProduct({
        company_id: '', branch_id: '', name: '', sku: '', hsn_sac_code: '',
        unit: 'Piece', sale_price: '', purchase_price: '', tax_rate: '0',
        stock_quantity: '0', reorder_level: '0', description: '',
      });
      if (created?.id) {
        addItem({
          id: created.id,
          name: created.name,
          hsn_sac_code: created.hsn_sac_code || '',
          uom: created.unit || 'NOS',
          price: created.purchase_price || 0,
          purchase_price: created.purchase_price,
          sale_price: created.sale_price,
          tax_rate: created.tax_rate,
          igst_rate: created.tax_rate,
          stock_quantity: created.stock_quantity,
          unit: created.unit,
          sku: created.sku,
          active: true,
        });
      }
    } catch (err) {
      const msg = getUserFriendlyError(err, 'Product creation failed.');
      showError('Product creation failed', msg);
      addAppLog({ module: 'Inventory', action: 'Create', status: 'error', message: msg });
    } finally {
      setProductSubmitting(false);
    }
  };

  /* ── Derived UI flags ── */
  const hasRunningTask = postTasks.some((t) => t.status === 'running');
  const hasErroredTask = postTasks.some((t) => t.status === 'error');
  const hasSkippedTask = postTasks.some((t) => t.status === 'skipped');

  const handleRefreshAfterWarning = useCallback(async () => {
    apiCache.delete('products');
    apiCache.delete('inventory');
    apiCache.delete('warehouses');
    await Promise.all([refreshProducts(), refreshWarehouses()]);
    setHas404Warning(false);
    showSuccess('Refreshed', 'Products and warehouses re-loaded from server.');
  }, [refreshProducts, refreshWarehouses, showSuccess]);

  /* ── Render guards ── */
  if (loadingInvoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex items-center gap-3">
          <FiLoader className="animate-spin text-indigo-600" />
          <span className="text-sm text-slate-600">Loading purchase invoice…</span>
        </div>
      </div>
    );
  }
  if (invoiceNotFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl px-8 py-8 text-center max-w-sm">
          <FiAlertCircle className="mx-auto text-rose-500 mb-3" size={32} />
          <h2 className="text-lg font-semibold text-slate-800">Purchase invoice not found</h2>
          <p className="text-sm text-slate-500 mt-1">The purchase invoice you are trying to edit does not exist.</p>
          <Link
            to="/purchases"
            className="inline-block mt-5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition"
          >
            Back to purchases
          </Link>
        </div>
      </div>
    );
  }

  /* ── Render ── */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-24">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-3 flex items-center gap-4">
          <button
            onClick={() => isDirty ? setConfirm({ kind: 'cancel' }) : navigate('/purchases')}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            aria-label="Back"
          >
            <FiArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-slate-900 truncate">Edit Purchase Invoice</h1>
            <p className="text-xs text-slate-500 truncate">
              {form.invoice_no || 'Purchase'} · {form.invoice_type.replace('_', ' ')} · {form.invoice_date}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              isDirty ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDirty ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {isDirty ? 'Unsaved' : 'All saved'}
            </span>
          </div>
        </div>
      </header>

      {errorMsg && (
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 mt-4">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2 text-sm">
            <FiAlertCircle size={16} />
            <span className="flex-1">{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} aria-label="Dismiss"><FiX size={14} /></button>
          </div>
        </div>
      )}

      <main className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-5">
              <FiUser className="text-indigo-600" /> Supplier Information
            </h2>
            <div className="space-y-4">
              <Field label="Company" required error={formErrors.company_id}>
                <select
                  value={form.company_id}
                  onChange={handleCompanyChange}
                  data-error={!!formErrors.company_id}
                  className={`${inputBase} ${formErrors.company_id ? inputError : ''}`}
                >
                  <option value="">Select Company</option>
                  {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <Field label="Branch" error={branchError}>
                <div className="relative">
                  <select
                    value={form.branch}
                    onChange={(e) => { setBranchTouched(true); updateForm('branch', e.target.value); }}
                    disabled={branchLoading || !form.company_id}
                    className={inputBase}
                  >
                    {availableBranches.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  {branchLoading && (
                    <div className="absolute right-8 top-1/2 -translate-y-1/2">
                      <FiLoader className="animate-spin text-slate-400" size={16} />
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Supplier" required error={formErrors.supplier_id}>
                <div ref={supplierDropdownRef} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={supplierSearch}
                      onChange={(e) => {
                        setSupplierSearch(sanitizeText(e.target.value, LIMITS.NAME));
                        setShowSupplierDropdown(true);
                        setSupplierHighlight(-1);
                      }}
                      onFocus={() => setShowSupplierDropdown(true)}
                      onKeyDown={onSupplierKeyDown}
                      placeholder="Search by name, code, GSTIN…"
                      aria-label="Search supplier"
                      aria-autocomplete="list"
                      aria-expanded={showSupplierDropdown}
                      className={inputBase}
                      maxLength={LIMITS.NAME}
                    />
                    {supplierSearch && (
                      <button
                        type="button"
                        onClick={() => { setSupplierSearch(''); setShowSupplierDropdown(false); }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label="Clear"
                      >
                        <FiX size={16} />
                      </button>
                    )}
                    {showSupplierDropdown && supplierSearch && (
                      <div role="listbox" className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                        {suppliersLoading ? (
                          <div className="p-4 text-sm text-slate-500 flex items-center justify-center gap-2">
                            <FiLoader className="animate-spin" size={14} /> Loading…
                          </div>
                        ) : suppliersError ? (
                          <div className="p-4 text-sm text-rose-500">Unable to load suppliers.</div>
                        ) : filteredSuppliers.length === 0 ? (
                          <div className="p-4 text-sm text-slate-500">No suppliers found.</div>
                        ) : (
                          filteredSuppliers.map((s, idx) => (
                            <button
                              key={s.id}
                              type="button"
                              role="option"
                              aria-selected={idx === supplierHighlight}
                              className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between ${
                                idx === supplierHighlight ? 'bg-indigo-50' : 'hover:bg-slate-50'
                              }`}
                              onMouseEnter={() => setSupplierHighlight(idx)}
                              onClick={() => {
                                setForm((p) => ({ ...p, supplier_id: s.id }));
                                setSupplierSearch('');
                                setShowSupplierDropdown(false);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-slate-800 truncate">{s.name}</div>
                                <div className="text-xs text-slate-500 truncate">
                                  {s.gstin && <span className="mr-2">GST: {s.gstin}</span>}
                                  {s.contact_no && <span className="mr-2">📞 {s.contact_no}</span>}
                                  {s.code && <span className="uppercase">{s.code}</span>}
                                </div>
                              </div>
                              {idx === supplierHighlight && <FiChevronRight className="text-indigo-500" size={16} />}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={openSupplierOffcanvas}
                    className="px-4 rounded-xl border border-slate-200 text-sm font-medium text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >
                    Add
                  </button>
                </div>
                {form.supplier_id && suppliers?.find((s) => s.id === Number(form.supplier_id)) && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1.5">
                    <FiCheckCircle size={12} />
                    {suppliers.find((s) => s.id === Number(form.supplier_id))!.name}
                  </p>
                )}
              </Field>

              <Field label="M/S.">
                <input
                  type="text"
                  value={form.supplier_name}
                  onChange={(e) => updateForm('supplier_name', sanitizeText(e.target.value, LIMITS.NAME))}
                  maxLength={LIMITS.NAME}
                  className={inputBase}
                />
              </Field>

              <Field label="Address">
                <textarea
                  rows={2}
                  value={form.supplier_address}
                  onChange={(e) => updateForm('supplier_address', sanitizeText(e.target.value))}
                  maxLength={LIMITS.TEXT}
                  className={inputBase}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact Person">
                  <input
                    type="text" value={form.contact_person}
                    onChange={(e) => updateForm('contact_person', sanitizeText(e.target.value, LIMITS.NAME))}
                    maxLength={LIMITS.NAME} className={inputBase}
                  />
                </Field>
                <Field label="Phone No">
                  <input
                    type="tel" value={form.phone_no}
                    onChange={(e) => updateForm('phone_no', sanitizeText(e.target.value, LIMITS.PHONE))}
                    maxLength={LIMITS.PHONE} className={inputBase}
                  />
                </Field>
              </div>

              <Field label="GSTIN / PAN" error={formErrors.gstin_pan}>
                <input
                  type="text"
                  value={form.gstin_pan}
                  onChange={(e) => updateForm('gstin_pan', sanitizeText(e.target.value.toUpperCase(), LIMITS.GSTIN))}
                  maxLength={LIMITS.GSTIN}
                  placeholder="27AAAAA0000A1Z5"
                  className={`${inputBase} font-mono tracking-wide`}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.reverse_charge}
                    onChange={(e) => updateForm('reverse_charge', e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Reverse Charge
                </label>
                <Field label="Ship To">
                  <select
                    value={form.ship_to}
                    onChange={(e) => updateForm('ship_to', e.target.value)}
                    className={inputBase}
                  >
                    <option value="">-- Select --</option>
                    <option value="billing">Same as Billing</option>
                    <option value="shipping">Shipping Address</option>
                  </select>
                </Field>
              </div>

              <Field label="Place of Supply" required error={formErrors.place_of_supply}>
                <input
                  type="text"
                  value={form.place_of_supply}
                  onChange={(e) => updateForm('place_of_supply', sanitizeText(e.target.value, LIMITS.SHORT))}
                  maxLength={LIMITS.SHORT}
                  placeholder="State / UT"
                  data-error={!!formErrors.place_of_supply}
                  className={`${inputBase} ${formErrors.place_of_supply ? inputError : ''}`}
                />
              </Field>
            </div>
          </section>

          <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 mb-5">
              <FiFileText className="text-indigo-600" /> Purchase Invoice Details
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Invoice Type">
                  <select
                    value={form.invoice_type}
                    onChange={(e) => updateForm('invoice_type', e.target.value as PurchaseFormData['invoice_type'])}
                    className={inputBase}
                  >
                    <option value="purchase_invoice">Purchase Invoice</option>
                    <option value="purchase_bill">Purchase Bill</option>
                  </select>
                </Field>

                <Field label="Invoice No." required error={formErrors.invoice_no}>
                  <input
                    type="text"
                    value={form.invoice_no}
                    onChange={(e) => updateForm('invoice_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                    maxLength={LIMITS.SHORT}
                    placeholder="Invoice number"
                    data-error={!!formErrors.invoice_no}
                    className={`${inputBase} font-mono ${formErrors.invoice_no ? inputError : ''}`}
                  />
                </Field>

                <Field label="Invoice Date">
                  <input
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => updateForm('invoice_date', e.target.value)}
                    className={inputBase}
                  />
                </Field>
              </div>

              <Field label="Due Date">
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => updateForm('due_date', e.target.value)}
                  className={inputBase}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Challan No.">
                  <input
                    type="text" value={form.challan_no}
                    onChange={(e) => updateForm('challan_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                    maxLength={LIMITS.SHORT} className={inputBase}
                  />
                </Field>
                <Field label="Challan Date">
                  <input
                    type="date" value={form.challan_date}
                    onChange={(e) => updateForm('challan_date', e.target.value)}
                    className={inputBase}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="PO Number">
                  <input
                    type="text" value={form.po_no}
                    onChange={(e) => updateForm('po_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                    maxLength={LIMITS.SHORT} className={inputBase}
                  />
                </Field>
                <Field label="PO Date">
                  <input
                    type="date" value={form.po_date}
                    onChange={(e) => updateForm('po_date', e.target.value)}
                    className={inputBase}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="LR No.">
                  <input
                    type="text" value={form.lr_no}
                    onChange={(e) => updateForm('lr_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                    maxLength={LIMITS.SHORT} className={inputBase}
                  />
                </Field>
                <Field label="E-Way Bill">
                  <input
                    type="text" value={form.eway_no}
                    onChange={(e) => updateForm('eway_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                    maxLength={LIMITS.SHORT} className={inputBase}
                  />
                </Field>
              </div>

              <Field label="Delivery Mode">
                <input
                  type="text" value={form.delivery_mode}
                  onChange={(e) => updateForm('delivery_mode', sanitizeText(e.target.value, LIMITS.SHORT))}
                  maxLength={LIMITS.SHORT} className={inputBase}
                />
              </Field>

              <Field label="Payment Terms">
                <input
                  type="text" value={form.payment_term} placeholder="e.g., Net 30"
                  onChange={(e) => updateForm('payment_term', sanitizeText(e.target.value, LIMITS.SHORT))}
                  maxLength={LIMITS.SHORT} className={inputBase}
                />
              </Field>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Automation on save</h3>
                <Toggle
                  checked={autoAdjustStock}
                  onChange={setAutoAdjustStock}
                  label="Auto-adjust stock (purchase)"
                  description={
                    defaultWarehouseId
                      ? `Increases → stock-in, decreases → stock-out on warehouse #${defaultWarehouseId}. Negative stock allowed.`
                      : 'No warehouse available — adjustment will be skipped.'
                  }
                />
              </div>
            </div>
          </section>
        </div>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 bg-slate-50/60" ref={productDropdownRef}>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search products by name, SKU, barcode or HSN…"
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(sanitizeText(e.target.value, LIMITS.NAME));
                    setShowProductDropdown(true);
                    setProductHighlight(-1);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onKeyDown={onProductKeyDown}
                  aria-label="Search products"
                  aria-autocomplete="list"
                  aria-expanded={showProductDropdown}
                  maxLength={LIMITS.NAME}
                  className={`${inputBase} pl-10 pr-10`}
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => { setProductSearch(''); setShowProductDropdown(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label="Clear"
                  >
                    <FiX size={16} />
                  </button>
                )}
                {showProductDropdown && productSearch && (
                  <div role="listbox" className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {productsLoading ? (
                      <div className="p-4 text-sm text-slate-500 flex items-center justify-center gap-2">
                        <FiLoader className="animate-spin" size={14} /> Loading…
                      </div>
                    ) : productsError ? (
                      <div className="p-4 text-sm text-rose-500">Unable to load products.</div>
                    ) : filteredProducts.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">No products found.</div>
                    ) : (
                      filteredProducts.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected={idx === productHighlight}
                          className={`w-full text-left px-4 py-2.5 text-sm flex justify-between items-center gap-3 border-b border-slate-100 last:border-0 ${
                            idx === productHighlight ? 'bg-indigo-50' : 'hover:bg-slate-50'
                          }`}
                          onMouseEnter={() => setProductHighlight(idx)}
                          onClick={() => { addItem(p); setProductHighlight(-1); }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-800 truncate">{p.name}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {p.sku && <span className="mr-2">SKU: {p.sku}</span>}
                              {p.stock_quantity != null && (
                                <span className={`mr-2 ${safeNumber(p.stock_quantity) <= 0 ? 'text-rose-500' : ''}`}>
                                  Stock: {p.stock_quantity}
                                </span>
                              )}
                              {p.uom && <span className="mr-2">UOM: {p.uom}</span>}
                              <span className="text-slate-400">ID #{p.id}</span>
                            </div>
                          </div>
                          <span className="text-slate-700 font-medium shrink-0">
                            ₹{formatCurrency(p.purchase_price ?? p.sale_price ?? p.price)}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={openProductOffcanvas}
                className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-sm font-medium flex items-center gap-1.5 whitespace-nowrap transition"
              >
                <FiPlus size={16} /> Add Product
              </button>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-3 px-4 text-left font-medium">Item</th>
                  <th className="py-3 px-3 text-center font-medium">Qty</th>
                  <th className="py-3 px-3 text-center font-medium">Unit</th>
                  <th className="py-3 px-3 text-right font-medium">Price</th>
                  <th className="py-3 px-3 text-center font-medium">Disc</th>
                  <th className="py-3 px-3 text-center font-medium">GST</th>
                  <th className="py-3 px-3 text-center font-medium">IGST</th>
                  <th className="py-3 px-3 text-right font-medium">Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-16 text-slate-400">
                      <FiBox size={36} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No products added yet.</p>
                      <p className="text-xs mt-1">Search above or click “Add Product”.</p>
                    </td>
                  </tr>
                ) : items.map((item, idx) => {
                  const stale = !productIndex.has(item.product_id);
                  const original = originalItems.find((o) => o.product_id === item.product_id);
                  const delta = original ? item.qty - original.qty : null;
                  return (
                    <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition">
                      <td className="py-2 px-4 max-w-[240px]">
                        <input
                          type="text" value={item.product_name}
                          onChange={(e) => updateItem(idx, 'product_name', sanitizeText(e.target.value, LIMITS.NAME))}
                          maxLength={LIMITS.NAME}
                          className="w-full bg-transparent text-sm outline-none truncate"
                          title={item.product_name}
                        />
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className="text-slate-400">ID #{item.product_id}</span>
                          {item.hsn_sac_code && <span className="text-slate-400">HSN: {item.hsn_sac_code}</span>}
                          {stale && (
                            <span className="text-amber-600 inline-flex items-center gap-0.5" title="Not in current product cache">
                              <FiSlash size={9} /> stale
                            </span>
                          )}
                          {delta !== null && Math.abs(delta) > 1e-9 && (
                            <span
                              className={`inline-flex items-center gap-0.5 ${delta > 0 ? 'text-indigo-600' : 'text-emerald-600'}`}
                              title={`Qty changed from ${original?.qty} to ${item.qty}`}
                            >
                              {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number" min={1} step={1} inputMode="numeric"
                          value={item.qty}
                          onChange={(e) => updateItem(idx, 'qty', Math.max(1, Math.floor(safeNumber(e.target.value, 1))))}
                          className="w-16 bg-transparent text-center text-sm outline-none tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text" value={item.uom}
                          onChange={(e) => updateItem(idx, 'uom', sanitizeText(e.target.value, 16))}
                          maxLength={16}
                          className="w-14 bg-transparent text-center text-sm outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number" min={0} step={0.01} inputMode="decimal"
                          value={item.price}
                          onChange={(e) => updateItem(idx, 'price', Math.max(0, safeNumber(e.target.value)))}
                          className="w-20 bg-transparent text-right text-sm outline-none tabular-nums"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <select
                            value={item.discount_type}
                            onChange={(e) => updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount')}
                            className="bg-transparent text-xs outline-none"
                          >
                            <option value="percent">%</option>
                            <option value="amount">₹</option>
                          </select>
                          {item.discount_type === 'percent' ? (
                            <input
                              type="number" min={0} max={100} step={0.01}
                              value={item.discount_percent}
                              onChange={(e) => updateItem(idx, 'discount_percent', clamp(safeNumber(e.target.value), 0, 100))}
                              className="w-14 bg-transparent text-center text-sm outline-none tabular-nums"
                            />
                          ) : (
                            <input
                              type="number" min={0} step={0.01}
                              value={item.discount_amount}
                              onChange={(e) => updateItem(idx, 'discount_amount', Math.max(0, safeNumber(e.target.value)))}
                              className="w-16 bg-transparent text-center text-sm outline-none tabular-nums"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={[0, 5, 12, 18, 28].includes(item.gst_slab) ? item.gst_slab : -1}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            updateItem(idx, 'gst_slab', v === -1 ? 0 : v);
                          }}
                          className="bg-transparent text-sm outline-none"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                          <option value={-1}>Custom</option>
                        </select>
                        {![0, 5, 12, 18, 28].includes(item.gst_slab) && (
                          <input
                            type="number" min={0} max={100} step={0.01}
                            value={item.gst_slab}
                            onChange={(e) => updateItem(idx, 'gst_slab', clamp(safeNumber(e.target.value), 0, 100))}
                            className="w-12 ml-1 bg-transparent text-center text-sm outline-none tabular-nums"
                          />
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.is_inter_state}
                          onChange={(e) => updateItem(idx, 'is_inter_state', e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          aria-label="Inter-state (IGST)"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-slate-800">
                        ₹{formatCurrency(item.total)}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          aria-label="Remove item"
                        >
                          <FiTrash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FiBox size={36} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No products added yet.</p>
              </div>
            ) : items.map((item, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400">#{idx + 1} · ID {item.product_id}</span>
                  <button
                    onClick={() => removeItem(idx)}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    aria-label="Remove item"
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
                <input
                  type="text" value={item.product_name}
                  onChange={(e) => updateItem(idx, 'product_name', sanitizeText(e.target.value, LIMITS.NAME))}
                  maxLength={LIMITS.NAME}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm font-medium"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">Qty</label>
                    <input
                      type="number" min={1} value={item.qty}
                      onChange={(e) => updateItem(idx, 'qty', Math.max(1, Math.floor(safeNumber(e.target.value, 1))))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">Unit</label>
                    <input
                      type="text" value={item.uom}
                      onChange={(e) => updateItem(idx, 'uom', sanitizeText(e.target.value, 16))}
                      maxLength={16}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">Price</label>
                    <input
                      type="number" min={0} step={0.01} value={item.price}
                      onChange={(e) => updateItem(idx, 'price', Math.max(0, safeNumber(e.target.value)))}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">Discount</label>
                    <div className="flex gap-1">
                      <select
                        value={item.discount_type}
                        onChange={(e) => updateItem(idx, 'discount_type', e.target.value as 'percent' | 'amount')}
                        className="bg-white border border-slate-200 rounded-lg px-1.5 py-1.5 text-sm"
                      >
                        <option value="percent">%</option>
                        <option value="amount">₹</option>
                      </select>
                      {item.discount_type === 'percent' ? (
                        <input
                          type="number" min={0} max={100} step={0.01} value={item.discount_percent}
                          onChange={(e) => updateItem(idx, 'discount_percent', clamp(safeNumber(e.target.value), 0, 100))}
                          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                        />
                      ) : (
                        <input
                          type="number" min={0} step={0.01} value={item.discount_amount}
                          onChange={(e) => updateItem(idx, 'discount_amount', Math.max(0, safeNumber(e.target.value)))}
                          className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-slate-500">GST Slab</label>
                    <select
                      value={[0, 5, 12, 18, 28].includes(item.gst_slab) ? item.gst_slab : -1}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateItem(idx, 'gst_slab', v === -1 ? 0 : v);
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                      <option value={-1}>Custom</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox" checked={item.is_inter_state}
                        onChange={(e) => updateItem(idx, 'is_inter_state', e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Inter-state (IGST)
                    </label>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-xs text-slate-500">Line total</span>
                  <span className="font-semibold tabular-nums">₹{formatCurrency(item.total)}</span>
                </div>
              </div>
            ))}
          </div>

          {formErrors.items && (
            <div className="px-4 pb-3 text-xs text-rose-600 flex items-center gap-1">
              <FiAlertCircle size={12} /> {formErrors.items}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">Invoice Information</h2>

            <Field label="Bank Account">
              <select
                value={form.bank_id}
                onChange={(e) => updateForm('bank_id', e.target.value ? Number(e.target.value) : '')}
                className={inputBase}
              >
                <option value="">Select Bank</option>
                {banks?.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank_name} ({b.account_no})</option>
                ))}
              </select>
            </Field>

            <Field label="Default Payment Type">
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'credit', label: 'Credit' },
                  { key: 'cash', label: 'Cash' },
                  { key: 'cheque', label: 'Cheque' },
                  { key: 'online', label: 'Online' },
                  { key: 'bank_transfer', label: 'Bank Transfer' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => updateForm('payment_type', key)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                      form.payment_type === key
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-300 ring-1 ring-indigo-200'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Terms Title">
              <input
                type="text" value={form.terms_title}
                onChange={(e) => updateForm('terms_title', sanitizeText(e.target.value, LIMITS.SHORT))}
                maxLength={LIMITS.SHORT} className={inputBase}
              />
            </Field>

            <Field label="Terms & Conditions">
              <textarea
                rows={5} value={form.terms_detail}
                onChange={(e) => updateForm('terms_detail', sanitizeText(e.target.value, LIMITS.LONG_TEXT))}
                maxLength={LIMITS.LONG_TEXT} className={`${inputBase} leading-relaxed`}
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Document Note">
                <textarea
                  rows={3} value={form.document_note}
                  onChange={(e) => updateForm('document_note', sanitizeText(e.target.value, LIMITS.LONG_TEXT))}
                  maxLength={LIMITS.LONG_TEXT} className={inputBase}
                />
              </Field>
              <Field label="Internal Note (private)">
                <textarea
                  rows={3} value={form.internal_note}
                  onChange={(e) => updateForm('internal_note', sanitizeText(e.target.value, LIMITS.LONG_TEXT))}
                  maxLength={LIMITS.LONG_TEXT} className={inputBase}
                />
              </Field>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Additional Charges</h3>
                <button
                  onClick={addAdditionalCharge}
                  className="text-xs text-indigo-600 flex items-center gap-1 hover:underline"
                >
                  <FiPlus size={12} /> Add
                </button>
              </div>
              {form.additional_charges.length === 0 ? (
                <p className="text-xs text-slate-400">No additional charges.</p>
              ) : (
                <div className="space-y-2">
                  {form.additional_charges.map((c) => (
                    <div key={c.id} className="flex gap-2">
                      <input
                        type="text" value={c.label} placeholder="Label"
                        onChange={(e) => updateAdditionalCharge(c.id, 'label', sanitizeText(e.target.value, LIMITS.SHORT))}
                        maxLength={LIMITS.SHORT}
                        className={`${inputBase} flex-1`}
                      />
                      <input
                        type="number" min={0} step={0.01} value={c.amount}
                        onChange={(e) => updateAdditionalCharge(c.id, 'amount', Math.max(0, safeNumber(e.target.value)))}
                        className={`${inputBase} w-32 text-right tabular-nums`}
                      />
                      <button
                        onClick={() => removeAdditionalCharge(c.id)}
                        className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        aria-label="Remove charge"
                      >
                        <FiTrash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Packing (₹)">
                <input
                  type="number" min={0} step={0.01} value={form.packing_charges}
                  onChange={(e) => updateForm('packing_charges', Math.max(0, safeNumber(e.target.value)))}
                  className={`${inputBase} text-right tabular-nums`}
                />
              </Field>
              <Field label="Discount (%)">
                <input
                  type="number" min={0} max={100} step={0.01} value={form.general_discount_percent}
                  onChange={(e) => updateForm('general_discount_percent', clamp(safeNumber(e.target.value), 0, 100))}
                  className={`${inputBase} text-right tabular-nums`}
                />
              </Field>
              <Field label="Discount (₹)">
                <input
                  type="number" min={0} step={0.01} value={form.general_discount_amount}
                  onChange={(e) => updateForm('general_discount_amount', Math.max(0, safeNumber(e.target.value)))}
                  disabled={form.general_discount_percent > 0}
                  className={`${inputBase} text-right tabular-nums`}
                />
              </Field>
              <Field label="TCS (%)">
                <input
                  type="number" min={0} max={100} step={0.01} value={form.tcs_percent}
                  onChange={(e) => updateForm('tcs_percent', clamp(safeNumber(e.target.value), 0, 100))}
                  className={`${inputBase} text-right tabular-nums`}
                />
              </Field>
            </div>
          </section>

          <section className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Summary</h2>

            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={summary.itemSubtotal} />
              <Row label="Item Discount" value={-summary.itemDiscountTotal} negative />
              <Row label="Taxable" value={summary.itemTaxableTotal} />
              {summary.generalDiscountAmount > 0 && (
                <Row label="General Discount" value={-summary.generalDiscountAmount} negative />
              )}
              {summary.cgstTotal > 0 && <Row label="CGST" value={summary.cgstTotal} />}
              {summary.sgstTotal > 0 && <Row label="SGST" value={summary.sgstTotal} />}
              {summary.igstTotal > 0 && <Row label="IGST" value={summary.igstTotal} />}
              {summary.additionalChargesTotal > 0 && <Row label="Additional" value={summary.additionalChargesTotal} />}
              {form.packing_charges > 0 && <Row label="Packing" value={form.packing_charges} />}
              {summary.tcsAmount > 0 && <Row label="TCS" value={summary.tcsAmount} />}
              {Math.abs(summary.roundOff) > 0.001 && <Row label="Round Off" value={summary.roundOff} />}

              <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="text-sm font-medium text-slate-600">Grand Total</span>
                <span className="text-xl font-bold text-slate-900 tabular-nums">
                  ₹{formatCurrency(summary.grandTotal)}
                </span>
              </div>
              <p className="text-xs text-slate-500 italic">{totalInWords}</p>
            </dl>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">Payments</h3>
                <button
                  onClick={addPayment}
                  className="text-xs text-indigo-600 flex items-center gap-1 hover:underline"
                >
                  <FiPlus size={12} /> Add Payment
                </button>
              </div>

              {form.payments.length === 0 ? (
                <p className="text-xs text-slate-400">No payments recorded.</p>
              ) : (
                <div className="space-y-3">
                  {form.payments.map((pay, idx) => (
                    <div key={pay.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                          Payment #{idx + 1}
                          {pay.persisted && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              saved
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => removePayment(pay.id)}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          aria-label="Remove payment"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number" min={0} step={0.01} placeholder="Amount"
                          value={pay.amount}
                          onChange={(e) => updatePayment(pay.id, 'amount', Math.max(0, safeNumber(e.target.value)))}
                          disabled={pay.persisted}
                          className={`${inputBase} text-right tabular-nums`}
                        />
                        <select
                          value={pay.payment_method}
                          onChange={(e) => updatePayment(pay.id, 'payment_method', e.target.value as PaymentEntry['payment_method'])}
                          disabled={pay.persisted}
                          className={inputBase}
                        >
                          <option value="UPI">UPI</option>
                          <option value="cash">Cash</option>
                          <option value="cheque">Cheque</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="other">Other</option>
                        </select>
                        <input
                          type="text" placeholder="Transaction ID"
                          value={pay.reference_no}
                          onChange={(e) => updatePayment(pay.id, 'reference_no', sanitizeText(e.target.value, LIMITS.SHORT))}
                          maxLength={LIMITS.SHORT}
                          disabled={pay.persisted}
                          className={`${inputBase} font-mono`}
                        />
                        <input
                          type="date" value={pay.transaction_date}
                          onChange={(e) => updatePayment(pay.id, 'transaction_date', e.target.value)}
                          disabled={pay.persisted}
                          className={inputBase}
                        />
                        <select
                          value={pay.payment_direction}
                          onChange={(e) => updatePayment(pay.id, 'payment_direction', e.target.value as 'inward' | 'outward')}
                          disabled={pay.persisted}
                          className={inputBase}
                        >
                          <option value="outward">Outward (Pay Supplier)</option>
                          <option value="inward">Inward (Refund)</option>
                        </select>
                        <input
                          type="text" placeholder="Bank Name"
                          value={pay.bank_name}
                          onChange={(e) => updatePayment(pay.id, 'bank_name', sanitizeText(e.target.value, LIMITS.SHORT))}
                          maxLength={LIMITS.SHORT}
                          disabled={pay.persisted}
                          className={inputBase}
                        />
                        <input
                          type="text" placeholder="Remarks"
                          value={pay.remarks}
                          onChange={(e) => updatePayment(pay.id, 'remarks', sanitizeText(e.target.value, LIMITS.TEXT))}
                          maxLength={LIMITS.TEXT}
                          disabled={pay.persisted}
                          className={`${inputBase} col-span-2`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Paid</span>
                  <span className="tabular-nums">₹{formatCurrency(summary.totalPaid)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-slate-700">Balance Due</span>
                  <span className={`tabular-nums ${summary.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    ₹{formatCurrency(summary.balanceDue)}
                  </span>
                </div>
              </div>
            </div>

            {(hasRunningTask || postTasks.length > 0) && (
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <FiPackage size={14} className="text-indigo-600" />
                    Post-save automation
                  </h3>
                  {hasRunningTask && <FiLoader className="animate-spin text-indigo-500" size={14} />}
                </div>
                <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {postTasks.map((task) => (
                    <li key={task.id} className="flex items-start gap-2 text-xs">
                      {task.status === 'success' && <FiCheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={12} />}
                      {task.status === 'error' && <FiAlertCircle className="text-rose-500 shrink-0 mt-0.5" size={12} />}
                      {task.status === 'running' && <FiLoader className="animate-spin text-indigo-500 shrink-0 mt-0.5" size={12} />}
                      {task.status === 'pending' && <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0 mt-0.5" />}
                      {task.status === 'skipped' && <FiSlash className="text-amber-500 shrink-0 mt-0.5" size={12} />}
                      <div className="min-w-0 flex-1">
                        <p className={`truncate ${
                          task.status === 'error' ? 'text-rose-700'
                          : task.status === 'skipped' ? 'text-amber-700'
                          : 'text-slate-700'
                        }`}>
                          {task.label}
                        </p>
                        {task.message && task.status !== 'success' && (
                          <p className="text-[10px] text-slate-500 truncate">{task.message}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {has404Warning && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-2">
                    <p className="flex items-start gap-1.5">
                      <FiAlertCircle size={12} className="mt-0.5 shrink-0" />
                      <span>
                        One or more products returned <strong>404 Not Found</strong> on the server. The purchase was
                        updated, but stock wasn't adjusted for those items.
                      </span>
                    </p>
                    <button
                      onClick={handleRefreshAfterWarning}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 transition"
                    >
                      <FiRefreshCw size={11} /> Refresh products & warehouses
                    </button>
                  </div>
                )}

                {hasErroredTask && !has404Warning && (
                  <p className="mt-2 text-[11px] text-rose-600 flex items-center gap-1">
                    <FiAlertCircle size={11} /> Some tasks failed — purchase is updated, but please review.
                  </p>
                )}
                {hasSkippedTask && !has404Warning && !hasErroredTask && (
                  <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1">
                    <FiSlash size={11} /> Some tasks were skipped.
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.06)]">
        <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <div className="hidden sm:block flex-1 min-w-0">
            <p className="text-xs text-slate-500">Grand total</p>
            <p className="text-lg font-bold text-slate-900 tabular-nums">
              ₹{formatCurrency(summary.grandTotal)}
            </p>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => isDirty ? setConfirm({ kind: 'cancel' }) : navigate('/purchases')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdate}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 shadow-sm shadow-indigo-500/30 disabled:opacity-50 transition"
            >
              {submitting ? <FiLoader className="animate-spin" size={15} /> : <FiSave size={15} />}
              Update Purchase
            </button>
          </div>
        </div>
      </footer>

      <ConfirmDialog
        open={confirm?.kind === 'cancel'}
        title="Discard changes?"
        message="You have unsaved changes. They will be lost if you leave this page."
        confirmLabel="Discard"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); navigate('/purchases'); }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'changeCompany'}
        title="Change company?"
        message="Changing the company will remove all purchase items. Continue?"
        confirmLabel="Continue"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === 'changeCompany') {
            setItems([]);
            setBranchTouched(true);
            setForm((p) => ({ ...p, company_id: confirm.nextCompany, supplier_id: '' }));
            setSupplierSearch('');
          }
          setConfirm(null);
        }}
      />

      {showSupplierOffcanvas && (
        <Suspense fallback={<OffcanvasFallback />}>
          <Offcanvas
            isOpen={showSupplierOffcanvas}
            title="Add Supplier"
            onClose={() => setShowSupplierOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full gap-3">
                <button
                  onClick={() => setShowSupplierOffcanvas(false)}
                  disabled={supplierSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createSupplier}
                  disabled={supplierSubmitting}
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {supplierSubmitting ? 'Creating…' : 'Create Supplier'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 pr-1" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-sm font-semibold text-slate-700 px-2">Supplier Detail</legend>
                <div className="mt-3 space-y-4">
                  <Field label="Company" required error={supplierFormErrors.company_id ? 'Required' : undefined}>
                    <select
                      value={newSupplier.company_id as string}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, company_id: e.target.value }))}
                      className={`${inputBase} ${supplierFormErrors.company_id ? inputError : ''}`}
                    >
                      <option value="">Select Company</option>
                      {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Supplier Name" required error={supplierFormErrors.name ? 'Required' : undefined}>
                    <input
                      type="text" value={newSupplier.name}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, name: sanitizeText(e.target.value, LIMITS.NAME) }))}
                      maxLength={LIMITS.NAME}
                      className={`${inputBase} ${supplierFormErrors.name ? inputError : ''}`}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Contact Person">
                      <input
                        type="text" value={newSupplier.contact_person}
                        onChange={(e) => setNewSupplier((p) => ({ ...p, contact_person: sanitizeText(e.target.value, LIMITS.NAME) }))}
                        maxLength={LIMITS.NAME} className={inputBase}
                      />
                    </Field>
                    <Field label="Contact No" error={supplierFormErrors.contact_no ? 'Invalid' : undefined}>
                      <input
                        type="tel" value={newSupplier.contact_no}
                        onChange={(e) => setNewSupplier((p) => ({ ...p, contact_no: sanitizeText(e.target.value, LIMITS.PHONE) }))}
                        maxLength={LIMITS.PHONE}
                        className={`${inputBase} ${supplierFormErrors.contact_no ? inputError : ''}`}
                      />
                    </Field>
                  </div>
                  <Field label="Email" error={supplierFormErrors.email ? 'Invalid email' : undefined}>
                    <input
                      type="email" value={newSupplier.email}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, email: sanitizeText(e.target.value, LIMITS.NAME) }))}
                      maxLength={LIMITS.NAME}
                      className={`${inputBase} ${supplierFormErrors.email ? inputError : ''}`}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="GSTIN" error={supplierFormErrors.gst_number ? 'Invalid GSTIN' : undefined}>
                      <input
                        type="text" value={newSupplier.gst_number}
                        onChange={(e) => setNewSupplier((p) => ({ ...p, gst_number: e.target.value.toUpperCase().slice(0, LIMITS.GSTIN) }))}
                        maxLength={LIMITS.GSTIN}
                        className={`${inputBase} font-mono tracking-wide ${supplierFormErrors.gst_number ? inputError : ''}`}
                      />
                    </Field>
                    <Field label="PAN" error={supplierFormErrors.pan ? 'Invalid PAN' : undefined}>
                      <input
                        type="text" value={newSupplier.pan}
                        onChange={(e) => setNewSupplier((p) => ({ ...p, pan: e.target.value.toUpperCase().slice(0, LIMITS.PAN) }))}
                        maxLength={LIMITS.PAN}
                        className={`${inputBase} font-mono tracking-wide ${supplierFormErrors.pan ? inputError : ''}`}
                      />
                    </Field>
                  </div>
                  <Field label="Billing City">
                    <input
                      type="text" value={newSupplier.billing_city}
                      onChange={(e) => setNewSupplier((p) => ({ ...p, billing_city: sanitizeText(e.target.value, LIMITS.SHORT) }))}
                      maxLength={LIMITS.SHORT} className={inputBase}
                    />
                  </Field>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {showProductOffcanvas && (
        <Suspense fallback={<OffcanvasFallback />}>
          <Offcanvas
            isOpen={showProductOffcanvas}
            title="Add Product"
            onClose={() => setShowProductOffcanvas(false)}
            footer={
              <div className="flex justify-between w-full gap-3">
                <button
                  onClick={() => setShowProductOffcanvas(false)}
                  disabled={productSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createProduct}
                  disabled={productSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {productSubmitting ? 'Creating…' : 'Create Product'}
                </button>
              </div>
            }
          >
            <div className="space-y-5 pr-1" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-sm font-semibold text-slate-700 px-2">Basic Information</legend>
                <div className="mt-3 space-y-4">
                  <Field label="Company" required error={productFormErrors.company_id ? 'Required' : undefined}>
                    <select
                      value={newProduct.company_id}
                      onChange={(e) => setNewProduct((p) => ({ ...p, company_id: e.target.value }))}
                      className={`${inputBase} ${productFormErrors.company_id ? inputError : ''}`}
                    >
                      <option value="">Select Company</option>
                      {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Product Name" required error={productFormErrors.name ? 'Required' : undefined}>
                    <input
                      type="text" value={newProduct.name}
                      onChange={(e) => setNewProduct((p) => ({ ...p, name: sanitizeText(e.target.value, LIMITS.NAME) }))}
                      maxLength={LIMITS.NAME}
                      className={`${inputBase} ${productFormErrors.name ? inputError : ''}`}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="SKU" hint="Auto-generated if blank">
                      <input
                        type="text" value={newProduct.sku}
                        onChange={(e) => setNewProduct((p) => ({ ...p, sku: sanitizeText(e.target.value, LIMITS.SKU) }))}
                        maxLength={LIMITS.SKU} className={inputBase}
                      />
                    </Field>
                    <Field label="HSN / SAC">
                      <input
                        type="text" value={newProduct.hsn_sac_code}
                        onChange={(e) => setNewProduct((p) => ({ ...p, hsn_sac_code: sanitizeText(e.target.value, LIMITS.SHORT) }))}
                        maxLength={LIMITS.SHORT} className={inputBase}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Unit" required error={productFormErrors.unit ? 'Required' : undefined}>
                      <input
                        type="text" value={newProduct.unit}
                        onChange={(e) => setNewProduct((p) => ({ ...p, unit: sanitizeText(e.target.value, 32) }))}
                        maxLength={32}
                        className={`${inputBase} ${productFormErrors.unit ? inputError : ''}`}
                      />
                    </Field>
                    <Field label="Purchase Price (₹)" required error={productFormErrors.purchase_price ? 'Required' : undefined}>
                      <input
                        type="number" min={0} step={0.01} value={newProduct.purchase_price}
                        onChange={(e) => setNewProduct((p) => ({ ...p, purchase_price: e.target.value }))}
                        className={`${inputBase} text-right tabular-nums ${productFormErrors.purchase_price ? inputError : ''}`}
                      />
                    </Field>
                  </div>
                  <Field label="Sale Price (₹)">
                    <input
                      type="number" min={0} step={0.01} value={newProduct.sale_price}
                      onChange={(e) => setNewProduct((p) => ({ ...p, sale_price: e.target.value }))}
                      className={`${inputBase} text-right tabular-nums`}
                    />
                  </Field>
                </div>
              </fieldset>
              <fieldset className="border border-slate-200 rounded-xl p-4">
                <legend className="text-sm font-semibold text-slate-700 px-2">Tax & Stock</legend>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <Field label="Tax Rate (%)">
                    <input
                      type="number" min={0} max={100} step={0.01} value={newProduct.tax_rate}
                      onChange={(e) => setNewProduct((p) => ({ ...p, tax_rate: e.target.value }))}
                      className={`${inputBase} text-right tabular-nums`}
                    />
                  </Field>
                  <Field
                    label="Stock Quantity"
                    hint={
                      defaultWarehouseId
                        ? `Allocated to warehouse #${defaultWarehouseId} (can be 0)`
                        : 'No warehouse — stock row created on first stock-in/out'
                    }
                  >
                    <input
                      type="number" min={0} value={newProduct.stock_quantity}
                      onChange={(e) => setNewProduct((p) => ({ ...p, stock_quantity: e.target.value }))}
                      className={`${inputBase} text-right tabular-nums`}
                    />
                  </Field>
                </div>
              </fieldset>
              <Field label="Description">
                <textarea
                  rows={2} value={newProduct.description}
                  onChange={(e) => setNewProduct((p) => ({ ...p, description: sanitizeText(e.target.value, LIMITS.LONG_TEXT) }))}
                  maxLength={LIMITS.LONG_TEXT} className={inputBase}
                />
              </Field>
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ──────────────────────────────────────────────────────────────────────── */

function Row({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  const display = negative ? `-₹${formatCurrency(Math.abs(value))}` : `₹${formatCurrency(value)}`;
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`tabular-nums ${negative ? 'text-rose-600' : 'text-slate-700'}`}>{display}</dd>
    </div>
  );
}

function OffcanvasFallback() {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl px-8 py-6 flex items-center gap-3">
        <FiLoader className="animate-spin text-indigo-600" />
        <span className="text-sm text-slate-600">Loading…</span>
      </div>
    </div>
  );
}