import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo } from 'react';
import {
  FiPlus,
  FiRefreshCw,
  FiTrash2,
  FiEdit,
  FiDownload,
  FiFileText,
  FiAlertCircle,
  FiFilter,
  FiSearch,
  FiX,
  FiUser,
  FiCheckCircle,
  FiCreditCard,
  FiEye,
  FiSave,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

const ModernDataTable = lazy(() =>
  import('../components/ModernDataTable').then(m => ({ default: m.ModernDataTable }))
);
const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then(m => ({ default: m.Offcanvas }))
);

type ReturnStatus =
  | 'draft'
  | 'confirmed'
  | 'stock_updated'
  | 'refund_pending'
  | 'completed'
  | 'cancelled';

type RefundStatus = 'pending' | 'refunded' | 'credited' | 'partial';
type Condition = 'good' | 'damaged';
type RestockStatus = 'restock' | 'no_restock';
type RefundMethod = 'cash' | 'upi' | 'bank' | 'credit';

const EDITABLE_STATUSES: ReturnStatus[] = ['draft'];
const DELETABLE_STATUSES: ReturnStatus[] = ['draft'];

function todayLocalISO(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  const err = error as any;
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    fallback
  );
}

function unwrapApiData<T = any>(response: any, fallback: T): T {
  if (Array.isArray(response)) return response as T;
  if (response?.data && Array.isArray(response.data)) return response.data as T;
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response ?? fallback;
}

function formatCurrency(value: unknown): string {
  return `₹${toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

type SalesReturn = {
  id: number;
  return_number: string;
  company_id?: number;
  branch_id?: number;
  warehouse_id: number;
  customer_id: number;
  original_sale_id?: number;
  original_invoice_no?: string;
  return_date: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  refund_amount: number;
  credit_amount: number;
  refund_status: RefundStatus;
  reason: string;
  remark?: string;
  status: ReturnStatus;
  customer?: { id: number; name: string };
  warehouse?: { id: number; name: string };
  items?: SalesReturnItem[];
};

type SalesReturnItem = {
  id: number;
  sales_return_id: number;
  sale_item_id?: number;
  product_id: number;
  variant_id?: number;
  product?: { id: number; name: string; sku?: string; hsn_code?: string };
  sold_qty: number;
  already_returned_qty: number;
  return_qty: number;
  rate: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  condition: Condition;
  restock_status: RestockStatus;
  reason?: string;
};

type ReturnItemForm = {
  sale_item_id?: number;
  product_id: number;
  variant_id?: number;
  product_name: string;
  hsn_code?: string;
  sold_qty: number;
  already_returned_qty: number;
  return_qty: number;
  rate: number;
  gst_rate: number;
  // Original full-line values from the invoice, used for proportional return calculations.
  original_discount_amount: number;
  original_taxable_amount: number;
  original_cgst_amount: number;
  original_sgst_amount: number;
  original_igst_amount: number;
  // Calculated values for the current return quantity.
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  condition: Condition;
  restock_status: RestockStatus;
  reason?: string;
};

type FormState = {
  company_id: number;
  branch_id: number;
  warehouse_id: number;
  customer_id: number;
  customer_name: string;
  original_sale_id: number | null;
  original_invoice_no: string;
  return_date: string;
  return_type: 'full' | 'partial';
  reason: string;
  remark: string;
  items: ReturnItemForm[];
  refund_method: RefundMethod;
  refund_amount: number;
  credit_amount: number;
};

const EMPTY_FORM: FormState = {
  company_id: 0,
  branch_id: 0,
  warehouse_id: 0,
  customer_id: 0,
  customer_name: '',
  original_sale_id: null,
  original_invoice_no: '',
  return_date: todayLocalISO(),
  return_type: 'partial',
  reason: '',
  remark: '',
  items: [],
  refund_method: 'credit',
  refund_amount: 0,
  credit_amount: 0,
};

const StatCardSkeleton = memo(() => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 animate-pulse">
    <div className="h-10 w-10 rounded-xl bg-slate-200" />
    <div className="space-y-2 flex-1">
      <div className="h-3 w-16 bg-slate-200 rounded" />
      <div className="h-6 w-8 bg-slate-200 rounded" />
    </div>
  </div>
));

const TableSkeleton = memo(() => (
  <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4 animate-pulse">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    {[...Array(8)].map((_, i) => (
      <div key={i} className="flex gap-4">
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
        <div className="h-4 w-1/5 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/6 bg-slate-200 rounded" />
        <div className="h-4 w-1/4 bg-slate-200 rounded" />
      </div>
    ))}
  </div>
));

const StatCard = memo(({ icon: Icon, label, value, tone }: {
  icon: any;
  label: string;
  value: number | string;
  tone: 'blue' | 'emerald' | 'amber' | 'rose';
}) => {
  const bg = tone === 'blue' ? 'bg-blue-100 text-blue-600' :
    tone === 'emerald' ? 'bg-emerald-100 text-emerald-600' :
      tone === 'amber' ? 'bg-amber-100 text-amber-600' :
        'bg-rose-100 text-rose-600';

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${bg}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
});

function calculateItem(item: ReturnItemForm, nextQty?: number): ReturnItemForm {
  const soldQty = Math.max(0, toNumber(item.sold_qty));
  const alreadyReturned = Math.max(0, toNumber(item.already_returned_qty));
  const maxReturnable = Math.max(0, soldQty - alreadyReturned);
  const qty = Math.min(maxReturnable, Math.max(0, toNumber(nextQty ?? item.return_qty)));

  // Prefer the original invoice tax/discount values when supplied. This preserves CGST/SGST
  // versus IGST classification and avoids ever adding IGST on top of CGST + SGST.
  const originalTax =
    toNumber(item.original_cgst_amount) +
    toNumber(item.original_sgst_amount) +
    toNumber(item.original_igst_amount);
  const hasOriginalTaxBreakup = originalTax > 0;

  if (soldQty > 0 && (hasOriginalTaxBreakup || toNumber(item.gst_rate) === 0)) {
    const ratio = qty / soldQty;
    const discountAmount = roundMoney(toNumber(item.original_discount_amount) * ratio);
    const taxableAmount = roundMoney(toNumber(item.original_taxable_amount) * ratio);
    const cgstAmount = roundMoney(toNumber(item.original_cgst_amount) * ratio);
    const sgstAmount = roundMoney(toNumber(item.original_sgst_amount) * ratio);
    const igstAmount = roundMoney(toNumber(item.original_igst_amount) * ratio);
    const tax = roundMoney(cgstAmount + sgstAmount + igstAmount);
    const total = roundMoney(taxableAmount + tax);

    return {
      ...item,
      return_qty: qty,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      total_amount: total,
    };
  }

  // Fallback for incomplete invoice responses. Treat the configured rate as the effective rate.
  // GST is split as CGST/SGST by default; IGST is only used when original IGST exists.
  const rate = Math.max(0, toNumber(item.rate));
  const gstRate = Math.max(0, toNumber(item.gst_rate));
  const taxableAmount = roundMoney(qty * rate);
  const gstAmount = roundMoney((taxableAmount * gstRate) / 100);
  const useIGST = toNumber(item.original_igst_amount) > 0 &&
    toNumber(item.original_cgst_amount) === 0 &&
    toNumber(item.original_sgst_amount) === 0;
  const cgstAmount = useIGST ? 0 : roundMoney(gstAmount / 2);
  const sgstAmount = useIGST ? 0 : roundMoney(gstAmount - cgstAmount);
  const igstAmount = useIGST ? gstAmount : 0;

  return {
    ...item,
    return_qty: qty,
    discount_amount: 0,
    taxable_amount: taxableAmount,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    igst_amount: igstAmount,
    total_amount: roundMoney(taxableAmount + cgstAmount + sgstAmount + igstAmount),
  };
}

export function SalesInvoiceReturnPage() {
  const { showSuccess, showError } = useNotification();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const {
    data: returns,
    loading,
    error,
    refresh,
  } = useApiCache<SalesReturn[]>('sales-returns-list', () => apiClient.getSalesInvoiceReturns());

  const { data: warehouses } = useApiCache<any[]>('warehouses', () => apiClient.getWarehouses());
  const { data: companies } = useApiCache<any[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<any[]>('branches', () => apiClient.getBranches());

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceSearchResults, setInvoiceSearchResults] = useState<any[]>([]);
  const [showInvoiceDropdown, setShowInvoiceDropdown] = useState(false);
  const [invoiceSearchLoading, setInvoiceSearchLoading] = useState(false);
  const invoiceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invoiceRequestRef = useRef(0);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const returnList = useMemo(() => Array.isArray(returns) ? returns : [], [returns]);
  const selectedReturn = useMemo(
    () => returnList.find(item => item.id === viewingId) || null,
    [returnList, viewingId]
  );
  const isReadOnly = Boolean(viewingId) || Boolean(
    editingId && !EDITABLE_STATUSES.includes(returnList.find(item => item.id === editingId)?.status || 'draft')
  );

  const filteredReturns = useMemo(() => {
    let filtered = [...returnList];
    const term = searchTerm.toLowerCase().trim();

    if (term) {
      filtered = filtered.filter(r =>
        r.return_number?.toLowerCase().includes(term) ||
        r.original_invoice_no?.toLowerCase().includes(term) ||
        r.customer?.name?.toLowerCase().includes(term) ||
        r.reason?.toLowerCase().includes(term)
      );
    }

    if (filterStatus !== 'all') filtered = filtered.filter(r => r.status === filterStatus);
    if (filterCompany !== 'all') filtered = filtered.filter(r => toNumber(r.company_id) === Number(filterCompany));
    if (filterBranch !== 'all') filtered = filtered.filter(r => toNumber(r.branch_id) === Number(filterBranch));

    return filtered;
  }, [returnList, searchTerm, filterStatus, filterCompany, filterBranch]);

  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / rowsPerPage));
  const paginatedReturns = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredReturns.slice(start, start + rowsPerPage);
  }, [filteredReturns, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterCompany, filterBranch]);

  useEffect(() => {
    setCurrentPage(page => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    return () => {
      if (invoiceDebounceRef.current) clearTimeout(invoiceDebounceRef.current);
    };
  }, []);

  const summary = useMemo(() => ({
    total: returnList.length,
    pending: returnList.filter(r => ['draft', 'confirmed', 'stock_updated', 'refund_pending'].includes(r.status)).length,
    completed: returnList.filter(r => r.status === 'completed').length,
    totalRefund: returnList.reduce((sum, r) => sum + toNumber(r.refund_amount), 0),
  }), [returnList]);

  const totals = useMemo(() => {
    const subtotalBeforeDiscount = formData.items.reduce(
      (sum, item) => sum + toNumber(item.return_qty) * toNumber(item.rate),
      0
    );
    const discountAmount = formData.items.reduce((sum, item) => sum + toNumber(item.discount_amount), 0);
    const taxableAmount = formData.items.reduce((sum, item) => sum + toNumber(item.taxable_amount), 0);
    const cgstAmount = formData.items.reduce((sum, item) => sum + toNumber(item.cgst_amount), 0);
    const sgstAmount = formData.items.reduce((sum, item) => sum + toNumber(item.sgst_amount), 0);
    const igstAmount = formData.items.reduce((sum, item) => sum + toNumber(item.igst_amount), 0);
    const totalTax = cgstAmount + sgstAmount + igstAmount;
    const grandTotal = roundMoney(taxableAmount + totalTax);

    return {
      subtotalBeforeDiscount: roundMoney(subtotalBeforeDiscount),
      discountAmount: roundMoney(discountAmount),
      taxableAmount: roundMoney(taxableAmount),
      cgstAmount: roundMoney(cgstAmount),
      sgstAmount: roundMoney(sgstAmount),
      igstAmount: roundMoney(igstAmount),
      totalTax: roundMoney(totalTax),
      grandTotal,
    };
  }, [formData.items]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setViewingId(null);
    setFormData({ ...EMPTY_FORM, return_date: todayLocalISO() });
    setInvoiceSearchQuery('');
    setInvoiceSearchResults([]);
    setShowInvoiceDropdown(false);
    setFormErrors({});
  }, []);

  const closePanel = useCallback(() => {
    if (submitting) return;
    setIsPanelOpen(false);
    setEditingId(null);
    setViewingId(null);
    setShowInvoiceDropdown(false);
    setFormErrors({});
  }, [submitting]);

  const createItemFromInvoice = useCallback((item: any): ReturnItemForm => {
    const soldQty = Math.max(0, toNumber(item.quantity ?? item.sold_qty));
    const originalDiscount = toNumber(item.discount_amount);
    const originalTaxable = item.taxable_amount !== undefined
      ? toNumber(item.taxable_amount)
      : roundMoney((soldQty * toNumber(item.rate)) - originalDiscount);

    return calculateItem({
      sale_item_id: item.id ?? item.sale_item_id,
      variant_id: item.variant_id,
      product_id: toNumber(item.product_id),
      product_name: item.product?.name || item.product_name || `Product #${item.product_id}`,
      hsn_code: item.product?.hsn_code || item.hsn_code || '',
      sold_qty: soldQty,
      already_returned_qty: Math.max(0, toNumber(item.already_returned_qty)),
      return_qty: 0,
      rate: Math.max(0, toNumber(item.rate)),
      gst_rate: Math.max(0, toNumber(item.gst_rate)),
      original_discount_amount: originalDiscount,
      original_taxable_amount: originalTaxable,
      original_cgst_amount: toNumber(item.cgst_amount),
      original_sgst_amount: toNumber(item.sgst_amount),
      original_igst_amount: toNumber(item.igst_amount),
      discount_amount: 0,
      taxable_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      total_amount: 0,
      condition: 'good',
      restock_status: 'restock',
      reason: '',
    });
  }, []);

  const loadInvoiceDetails = useCallback(async (invoiceId: number) => {
    setInvoiceSearchLoading(true);
    try {
      const result = await apiClient.getInvoiceDetailsForReturn(invoiceId);
      const invoice = unwrapApiData<any>(result, null);
      if (!invoice?.id) throw new Error('Invoice details were not returned by the server.');

      const invoiceItems = Array.isArray(invoice.items) ? invoice.items : [];
      const items = invoiceItems.map(createItemFromInvoice);

      setFormData(prev => ({
        ...prev,
        original_sale_id: toNumber(invoice.id),
        original_invoice_no: invoice.invoice_number || invoice.invoice_no || `INV-${invoice.id}`,
        customer_id: toNumber(invoice.customer_id),
        customer_name: invoice.customer?.name || invoice.customer_name || '',
        warehouse_id: toNumber(invoice.warehouse_id) || prev.warehouse_id,
        company_id: toNumber(invoice.company_id) || prev.company_id,
        branch_id: toNumber(invoice.branch_id) || prev.branch_id,
        items,
        refund_amount: 0,
        credit_amount: 0,
        refund_method: 'credit',
      }));

      setInvoiceSearchQuery(invoice.invoice_number || invoice.invoice_no || `INV-${invoice.id}`);
      setInvoiceSearchResults([]);
      setShowInvoiceDropdown(false);
      setFormErrors(prev => {
        const next = { ...prev };
        delete next.original_sale_id;
        delete next.customer_id;
        delete next.items;
        return next;
      });
    } catch (err) {
      showError('Invoice load failed', getApiErrorMessage(err, 'Unable to load invoice details.'));
    } finally {
      setInvoiceSearchLoading(false);
    }
  }, [createItemFromInvoice, showError]);

  const handleInvoiceSearch = useCallback((query: string) => {
    const trimmed = query.trim();
    setInvoiceSearchQuery(query);
    setFormErrors(prev => {
      const next = { ...prev };
      delete next.original_sale_id;
      return next;
    });

    if (invoiceDebounceRef.current) clearTimeout(invoiceDebounceRef.current);

    if (!trimmed) {
      invoiceRequestRef.current += 1;
      setInvoiceSearchResults([]);
      setShowInvoiceDropdown(false);
      return;
    }

    const requestId = ++invoiceRequestRef.current;
    invoiceDebounceRef.current = setTimeout(async () => {
      setInvoiceSearchLoading(true);
      try {
        const result = await apiClient.searchReturnInvoices(trimmed);
        if (requestId !== invoiceRequestRef.current) return;
        const invoices = unwrapApiData<any[]>(result, []);
        setInvoiceSearchResults(Array.isArray(invoices) ? invoices : []);
        setShowInvoiceDropdown(true);
      } catch (err) {
        if (requestId !== invoiceRequestRef.current) return;
        setInvoiceSearchResults([]);
        showError('Invoice search failed', getApiErrorMessage(err, 'Unable to search invoices.'));
      } finally {
        if (requestId === invoiceRequestRef.current) setInvoiceSearchLoading(false);
      }
    }, 350);
  }, [showError]);

  const handleCreate = useCallback(() => {
    resetForm();
    setIsPanelOpen(true);
  }, [resetForm]);

  const handleView = useCallback((returnItem: SalesReturn) => {
    setViewingId(returnItem.id);
    setEditingId(null);
    setFormData({
      company_id: toNumber(returnItem.company_id),
      branch_id: toNumber(returnItem.branch_id),
      warehouse_id: toNumber(returnItem.warehouse_id),
      customer_id: toNumber(returnItem.customer_id),
      customer_name: returnItem.customer?.name || '',
      original_sale_id: toNumber(returnItem.original_sale_id) || null,
      original_invoice_no: returnItem.original_invoice_no || '',
      return_date: returnItem.return_date || todayLocalISO(),
      return_type: 'partial',
      reason: returnItem.reason || '',
      remark: returnItem.remark || '',
      refund_method: toNumber(returnItem.refund_amount) > 0 ? 'cash' : 'credit',
      refund_amount: toNumber(returnItem.refund_amount),
      credit_amount: toNumber(returnItem.credit_amount),
      items: (returnItem.items || []).map(item => ({
        sale_item_id: item.sale_item_id,
        variant_id: item.variant_id,
        product_id: item.product_id,
        product_name: item.product?.name || `Product #${item.product_id}`,
        hsn_code: item.product?.hsn_code || '',
        sold_qty: toNumber(item.sold_qty),
        already_returned_qty: toNumber(item.already_returned_qty),
        return_qty: toNumber(item.return_qty),
        rate: toNumber(item.rate),
        gst_rate: toNumber(item.gst_rate),
        original_discount_amount: toNumber(item.discount_amount),
        original_taxable_amount: toNumber(item.taxable_amount),
        original_cgst_amount: toNumber(item.cgst_amount),
        original_sgst_amount: toNumber(item.sgst_amount),
        original_igst_amount: toNumber(item.igst_amount),
        discount_amount: toNumber(item.discount_amount),
        taxable_amount: toNumber(item.taxable_amount),
        cgst_amount: toNumber(item.cgst_amount),
        sgst_amount: toNumber(item.sgst_amount),
        igst_amount: toNumber(item.igst_amount),
        total_amount: toNumber(item.total_amount),
        condition: item.condition || 'good',
        restock_status: item.restock_status || 'restock',
        reason: item.reason || '',
      })),
    });
    setFormErrors({});
    setInvoiceSearchQuery(returnItem.original_invoice_no || '');
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((returnItem: SalesReturn) => {
    if (!EDITABLE_STATUSES.includes(returnItem.status)) {
      handleView(returnItem);
      showError('Return is locked', 'Only draft returns can be edited. Confirmed/processed returns must be handled through the proper reversal workflow.');
      return;
    }
    setEditingId(returnItem.id);
    setViewingId(null);
    setFormData({
      company_id: toNumber(returnItem.company_id),
      branch_id: toNumber(returnItem.branch_id),
      warehouse_id: toNumber(returnItem.warehouse_id),
      customer_id: toNumber(returnItem.customer_id),
      customer_name: returnItem.customer?.name || '',
      original_sale_id: toNumber(returnItem.original_sale_id) || null,
      original_invoice_no: returnItem.original_invoice_no || '',
      return_date: returnItem.return_date || todayLocalISO(),
      return_type: 'partial',
      reason: returnItem.reason || '',
      remark: returnItem.remark || '',
      refund_method: toNumber(returnItem.refund_amount) > 0 ? 'cash' : 'credit',
      refund_amount: toNumber(returnItem.refund_amount),
      credit_amount: toNumber(returnItem.credit_amount),
      items: (returnItem.items || []).map(item => ({
        sale_item_id: item.sale_item_id,
        variant_id: item.variant_id,
        product_id: item.product_id,
        product_name: item.product?.name || `Product #${item.product_id}`,
        hsn_code: item.product?.hsn_code || '',
        sold_qty: toNumber(item.sold_qty),
        already_returned_qty: Math.max(0, toNumber(item.already_returned_qty)),
        return_qty: Math.max(0, toNumber(item.return_qty)),
        rate: toNumber(item.rate),
        gst_rate: toNumber(item.gst_rate),
        original_discount_amount: toNumber(item.discount_amount),
        original_taxable_amount: toNumber(item.taxable_amount),
        original_cgst_amount: toNumber(item.cgst_amount),
        original_sgst_amount: toNumber(item.sgst_amount),
        original_igst_amount: toNumber(item.igst_amount),
        discount_amount: toNumber(item.discount_amount),
        taxable_amount: toNumber(item.taxable_amount),
        cgst_amount: toNumber(item.cgst_amount),
        sgst_amount: toNumber(item.sgst_amount),
        igst_amount: toNumber(item.igst_amount),
        total_amount: toNumber(item.total_amount),
        condition: item.condition || 'good',
        restock_status: item.restock_status || 'restock',
        reason: item.reason || '',
      })),
    });
    setFormErrors({});
    setInvoiceSearchQuery(returnItem.original_invoice_no || '');
    setIsPanelOpen(true);
  }, [handleView, showError]);

  const handleDelete = useCallback(async (returnItem: SalesReturn) => {
    if (!DELETABLE_STATUSES.includes(returnItem.status)) {
      showError('Delete blocked', 'Only draft returns can be deleted. Processed returns must not be hard-deleted.');
      return;
    }

    if (!window.confirm(`Delete draft return ${returnItem.return_number}? This cannot be undone.`)) return;

    try {
      await apiClient.deleteSalesInvoiceReturn(returnItem.id);
      showSuccess('Draft deleted', `${returnItem.return_number} was deleted.`);
      addAppLog({
        module: 'Sales Invoice Return',
        action: 'Delete',
        status: 'success',
        message: `Deleted draft ${returnItem.return_number}`,
      });
      await refresh();
    } catch (err) {
      showError('Delete failed', getApiErrorMessage(err, 'Unable to delete the return.'));
    }
  }, [refresh, showError, showSuccess]);

  const updateItem = useCallback((index: number, field: keyof ReturnItemForm, value: any) => {
    if (isReadOnly) return;

    setFormData(prev => {
      const items = [...prev.items];
      if (!items[index]) return prev;

      const current = { ...items[index] };
      if (field === 'return_qty') {
        items[index] = calculateItem(current, toNumber(value));
        return { ...prev, items };
      }

      items[index] = { ...current, [field]: value } as ReturnItemForm;
      return { ...prev, items };
    });

    if (field === 'return_qty') {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[`return_qty_${index}`];
        return next;
      });
    }
  }, [isReadOnly]);

  const removeItem = useCallback((index: number) => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }, [isReadOnly]);

  const setFullReturn = useCallback(() => {
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      return_type: 'full',
      items: prev.items.map(item =>
        calculateItem(item, Math.max(0, item.sold_qty - item.already_returned_qty))
      ),
    }));
  }, [isReadOnly]);

  const setPartialReturn = useCallback(() => {
    if (isReadOnly) return;
    setFormData(prev => ({ ...prev, return_type: 'partial' }));
  }, [isReadOnly]);

  const validateForm = useCallback((targetStatus: 'draft' | 'confirmed'): boolean => {
    const errors: Record<string, string> = {};
    const hasPositiveQty = formData.items.some(item => toNumber(item.return_qty) > 0);

    if (!formData.company_id) errors.company_id = 'Company is required.';
    if (!formData.customer_id) errors.customer_id = 'Customer is required.';
    if (!formData.original_sale_id) errors.original_sale_id = 'Select a valid original invoice.';
    if (!formData.warehouse_id) errors.warehouse_id = 'Return warehouse is required.';
    if (!formData.return_date) errors.return_date = 'Return date is required.';
    if (!formData.reason.trim()) errors.reason = 'Return reason is required.';
    if (formData.items.length === 0) errors.items = 'Load invoice items first.';
    if (!hasPositiveQty) errors.items = 'Enter a return quantity for at least one item.';

    formData.items.forEach((item, index) => {
      const qty = toNumber(item.return_qty);
      const maxReturnable = Math.max(0, toNumber(item.sold_qty) - toNumber(item.already_returned_qty));
      if (qty < 0) errors[`return_qty_${index}`] = 'Quantity cannot be negative.';
      if (qty > maxReturnable) errors[`return_qty_${index}`] = `Maximum returnable quantity is ${maxReturnable}.`;
    });

    if (targetStatus === 'confirmed') {
      const refundAmount = roundMoney(formData.refund_amount);
      const creditAmount = roundMoney(formData.credit_amount);
      if (refundAmount < 0 || creditAmount < 0) {
        errors.refund = 'Settlement amounts cannot be negative.';
      }
      if (roundMoney(refundAmount + creditAmount) !== totals.grandTotal) {
        errors.refund = `Refund + credit must equal ${formatCurrency(totals.grandTotal)} before confirmation.`;
      }
      if (formData.refund_method === 'credit') {
        if (refundAmount !== 0 || creditAmount !== totals.grandTotal) {
          errors.refund = 'Credit Note method requires the full return amount as credit.';
        }
      } else if (creditAmount !== 0 || refundAmount !== totals.grandTotal) {
        errors.refund = `${formatStatus(formData.refund_method)} method requires the full return amount as refund.`;
      }
    }

    setFormErrors(errors);
    if (Object.keys(errors).length) {
      showError('Validation failed', Object.values(errors)[0]);
      return false;
    }
    return true;
  }, [formData, showError, totals.grandTotal]);

  const buildPayload = useCallback((targetStatus: 'draft' | 'confirmed') => ({
    company_id: formData.company_id,
    branch_id: formData.branch_id || null,
    warehouse_id: formData.warehouse_id,
    customer_id: formData.customer_id,
    original_sale_id: formData.original_sale_id,
    return_date: formData.return_date,
    return_type: formData.return_type,
    reason: formData.reason.trim(),
    remark: formData.remark.trim() || null,
    // Status is deliberately selected by the action button, not by editable form state.
    status: targetStatus,
    refund_method: formData.refund_method,
    refund_amount: roundMoney(formData.refund_amount),
    credit_amount: roundMoney(formData.credit_amount),
    items: formData.items
      .filter(item => toNumber(item.return_qty) > 0)
      .map(item => ({
        sale_item_id: item.sale_item_id,
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        return_qty: toNumber(item.return_qty),
        rate: roundMoney(item.rate),
        gst_rate: roundMoney(item.gst_rate),
        discount_amount: roundMoney(item.discount_amount),
        taxable_amount: roundMoney(item.taxable_amount),
        cgst_amount: roundMoney(item.cgst_amount),
        sgst_amount: roundMoney(item.sgst_amount),
        igst_amount: roundMoney(item.igst_amount),
        condition: item.condition,
        restock_status: item.restock_status,
        reason: item.reason?.trim() || null,
      })),
  }), [formData]);

  const handleSubmit = useCallback(async (targetStatus: 'draft' | 'confirmed') => {
    if (isReadOnly || submitting) return;
    if (!validateForm(targetStatus)) return;

    setSubmitting(true);
    try {
      const payload = buildPayload(targetStatus);
      if (editingId) {
        await apiClient.updateSalesInvoiceReturn(editingId, payload);
        showSuccess(
          targetStatus === 'confirmed' ? 'Return confirmed' : 'Draft saved',
          targetStatus === 'confirmed'
            ? 'Sales return confirmed successfully.'
            : 'Sales return draft updated successfully.'
        );
        addAppLog({
          module: 'Sales Invoice Return',
          action: targetStatus === 'confirmed' ? 'Confirm' : 'Update Draft',
          status: 'success',
          message: `Updated return #${editingId} as ${targetStatus}`,
        });
      } else {
        await apiClient.createSalesInvoiceReturn(payload);
        showSuccess(
          targetStatus === 'confirmed' ? 'Return confirmed' : 'Draft saved',
          targetStatus === 'confirmed'
            ? 'Sales return created and confirmed successfully.'
            : 'Sales return draft created successfully.'
        );
        addAppLog({
          module: 'Sales Invoice Return',
          action: targetStatus === 'confirmed' ? 'Confirm' : 'Create Draft',
          status: 'success',
          message: `Created return as ${targetStatus}`,
        });
      }

      setIsPanelOpen(false);
      setEditingId(null);
      await refresh();
    } catch (err) {
      showError('Save failed', getApiErrorMessage(err, 'Unable to save the sales return.'));
      addAppLog({
        module: 'Sales Invoice Return',
        action: targetStatus === 'confirmed' ? 'Confirm' : 'Save Draft',
        status: 'error',
        message: getApiErrorMessage(err, 'Unable to save the sales return.'),
      });
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, editingId, isReadOnly, refresh, showError, showSuccess, submitting, validateForm]);

  const handleExport = useCallback(() => {
    if (!filteredReturns.length) {
      showError('Nothing to export', 'There are no returns matching the current filters.');
      return;
    }

    const headers = [
      'Return Number',
      'Original Invoice',
      'Customer',
      'Date',
      'Reason',
      'Grand Total',
      'Refund Amount',
      'Credit Amount',
      'Refund Status',
      'Status',
    ];

    const csvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredReturns.map(r => [
      r.return_number,
      r.original_invoice_no || '-',
      r.customer?.name || r.customer_id,
      r.return_date,
      r.reason,
      toNumber(r.grand_total).toFixed(2),
      toNumber(r.refund_amount).toFixed(2),
      toNumber(r.credit_amount).toFixed(2),
      r.refund_status,
      r.status,
    ]);

    const csv = '\uFEFF' + [
      headers.map(csvValue).join(','),
      ...rows.map(row => row.map(csvValue).join(',')),
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sales-returns-${todayLocalISO()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showSuccess('Export complete', `${filteredReturns.length} return(s) exported.`);
  }, [filteredReturns, showError, showSuccess]);

  const columns = useMemo(() => [
    {
      name: 'Return #',
      selector: (row: SalesReturn) => row.return_number || `#${row.id}`,
      sortable: true,
      width: '140px',
    },
    {
      name: 'Original Invoice',
      selector: (row: SalesReturn) => row.original_invoice_no || '-',
      width: '150px',
    },
    {
      name: 'Customer',
      selector: (row: SalesReturn) => row.customer?.name || row.customer_id,
      cell: (row: SalesReturn) => (
        <div className="flex items-center gap-2">
          <FiUser size={14} className="text-slate-400" />
          <span>{row.customer?.name || `ID: ${row.customer_id}`}</span>
        </div>
      ),
      width: '180px',
    },
    {
      name: 'Date',
      selector: (row: SalesReturn) => row.return_date,
      sortable: true,
      width: '120px',
    },
    {
      name: 'Items',
      selector: (row: SalesReturn) => row.items?.filter(item => toNumber(item.return_qty) > 0).length || 0,
      width: '80px',
      center: true,
    },
    {
      name: 'Return Amount',
      selector: (row: SalesReturn) => toNumber(row.grand_total),
      sortable: true,
      cell: (row: SalesReturn) => <span className="font-medium">{formatCurrency(row.grand_total)}</span>,
      width: '135px',
    },
    {
      name: 'Refund',
      selector: (row: SalesReturn) => row.refund_status,
      cell: (row: SalesReturn) => {
        const colors: Record<string, string> = {
          pending: 'bg-amber-100 text-amber-700',
          refunded: 'bg-emerald-100 text-emerald-700',
          credited: 'bg-blue-100 text-blue-700',
          partial: 'bg-orange-100 text-orange-700',
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[row.refund_status] || 'bg-slate-100 text-slate-700'}`}>
            {formatStatus(row.refund_status)}
          </span>
        );
      },
      width: '110px',
    },
    {
      name: 'Status',
      selector: (row: SalesReturn) => row.status,
      cell: (row: SalesReturn) => {
        const colors: Record<string, string> = {
          draft: 'bg-slate-100 text-slate-700',
          confirmed: 'bg-blue-100 text-blue-700',
          stock_updated: 'bg-purple-100 text-purple-700',
          refund_pending: 'bg-amber-100 text-amber-700',
          completed: 'bg-emerald-100 text-emerald-700',
          cancelled: 'bg-rose-100 text-rose-700',
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[row.status] || 'bg-slate-100 text-slate-700'}`}>
            {formatStatus(row.status)}
          </span>
        );
      },
      width: '130px',
    },
    {
      name: 'Actions',
      cell: (row: SalesReturn) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleView(row)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            title="View"
          >
            <FiEye size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleEdit(row)}
            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-40"
            title="Edit draft"
            disabled={!EDITABLE_STATUSES.includes(row.status)}
          >
            <FiEdit size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row)}
            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
            title="Delete draft"
            disabled={!DELETABLE_STATUSES.includes(row.status)}
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      ),
      width: '120px',
    },
  ], [handleDelete, handleEdit, handleView]);

  const branchOptions = useMemo(
    () => (branches || []).filter((branch: any) =>
      filterCompany === 'all' || toNumber(branch.company_id) === Number(filterCompany)
    ),
    [branches, filterCompany]
  );

  const formBranchOptions = useMemo(
    () => (branches || []).filter((branch: any) => toNumber(branch.company_id) === formData.company_id),
    [branches, formData.company_id]
  );

  const settlementMode = formData.refund_method;
  const refundFieldDisabled = isReadOnly || settlementMode === 'credit';
  const creditFieldDisabled = isReadOnly || settlementMode !== 'credit';

  useEffect(() => {
    if (isReadOnly) return;
    if (settlementMode === 'credit') {
      setFormData(prev => ({ ...prev, refund_amount: 0 }));
    } else {
      setFormData(prev => ({ ...prev, credit_amount: 0 }));
    }
  }, [isReadOnly, settlementMode]);

  return (
    <div className="min-h-screen bg-[#f5f7fb] p-4 md:p-7 text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6 rounded-3xl bg-slate-950 px-5 py-6 md:px-8 md:py-7 shadow-xl shadow-slate-300/50">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-300">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" /> Sales Operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl flex items-center gap-3">
            <FiFileText className="text-blue-300" /> Sales Returns
            <span className="text-sm font-normal text-blue-100/70 ml-2">Reverse sales & manage stock</span>
          </h1>
          <p className="text-sm text-slate-300">Draft → confirm → stock/refund processing → completed</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20 disabled:opacity-60"
          >
            <FiRefreshCw className={loading ? 'animate-spin inline mr-1' : 'inline mr-1'} size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/20"
          >
            <FiDownload className="inline mr-1" size={14} /> Export
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-xl bg-blue-400 text-slate-950 px-3 py-2 text-sm font-medium hover:bg-blue-300 shadow-md shadow-blue-500/20"
          >
            <FiPlus className="inline mr-1" size={14} /> New Return
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="search"
            placeholder="Search return, invoice, customer..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 transition"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiFilter size={16} className="text-slate-500" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="stock_updated">Stock Updated</option>
            <option value="refund_pending">Refund Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={filterCompany} onChange={e => { setFilterCompany(e.target.value); setFilterBranch('all'); }} className="rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Companies</option>
            {(companies || []).map((company: any) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className="rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm">
            <option value="all">All Branches</option>
            {branchOptions.map((branch: any) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading ? [...Array(4)].map((_, i) => <StatCardSkeleton key={i} />) : (
          <>
            <StatCard icon={FiFileText} label="Total Returns" value={summary.total} tone="blue" />
            <StatCard icon={FiAlertCircle} label="In Progress" value={summary.pending} tone="amber" />
            <StatCard icon={FiCheckCircle} label="Completed" value={summary.completed} tone="emerald" />
            <StatCard icon={FiCreditCard} label="Total Refund" value={formatCurrency(summary.totalRefund)} tone="rose" />
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
          <FiAlertCircle size={20} />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void refresh()} className="underline font-medium">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <Suspense fallback={<TableSkeleton />}>
          {loading ? <TableSkeleton /> : (
            <>
              <ModernDataTable
                title="Sales Returns"
                columns={columns}
                data={paginatedReturns}
                loading={false}
                striped
                highlightOnHover
                pointerOnHover
              />
              {filteredReturns.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-500">No sales returns found.</div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-t">
                  <span className="text-sm text-slate-600">
                    Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, filteredReturns.length)} of {filteredReturns.length}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">««</button>
                      <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">‹</button>
                      <span className="px-3 py-1 text-sm font-medium">{currentPage} / {totalPages}</span>
                      <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">›</button>
                      <button type="button" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-3 py-1 text-sm rounded-lg border disabled:opacity-40">»»</button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>

      {isPanelOpen && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"><div className="bg-white p-8 rounded-2xl">Loading...</div></div>}>
          <Offcanvas
            isOpen={isPanelOpen}
            title={viewingId ? `View Return ${selectedReturn?.return_number || ''}` : editingId ? 'Edit Draft Return' : 'Create Sales Return'}
            onClose={closePanel}
            footer={
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
                <div className="text-xs text-slate-500">
                  {viewingId
                    ? `Status: ${formatStatus(selectedReturn?.status || '')}`
                    : 'Confirmed returns should be treated as financial/stock transactions and not hard-deleted.'}
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={closePanel} className="px-4 py-2 rounded-lg border text-slate-600 hover:bg-slate-50" disabled={submitting}>
                    <FiX className="inline mr-1" /> Close
                  </button>
                  {!isReadOnly && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSubmit('draft')}
                        disabled={submitting}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FiSave className="inline mr-1" /> {submitting ? 'Saving...' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSubmit('confirmed')}
                        disabled={submitting}
                        className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submitting ? 'Processing...' : 'Confirm Return'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            }
          >
            <div className="space-y-5 overflow-y-auto hide-scrollbar pr-2" style={{ maxHeight: '70vh' }}>
              {isReadOnly && !viewingId && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  This return is locked because it has already moved beyond draft status.
                </div>
              )}

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Original Sale
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Search Invoice *</label>
                    <input
                      type="search"
                      value={invoiceSearchQuery}
                      onChange={e => handleInvoiceSearch(e.target.value)}
                      placeholder="Enter invoice number..."
                      disabled={isReadOnly || !!editingId}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${formErrors.original_sale_id ? 'border-rose-400 ring-2 ring-rose-100' : 'border-gray-300'}`}
                    />
                    {showInvoiceDropdown && !isReadOnly && !editingId && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                        {invoiceSearchLoading && <div className="p-3 text-sm text-slate-500">Searching...</div>}
                        {!invoiceSearchLoading && invoiceSearchResults.length === 0 && (
                          <div className="p-3 text-sm text-slate-500">No eligible invoices found.</div>
                        )}
                        {!invoiceSearchLoading && invoiceSearchResults.map((invoice: any) => (
                          <button
                            type="button"
                            key={invoice.id}
                            onClick={() => void loadInvoiceDetails(toNumber(invoice.id))}
                            className="w-full text-left px-3 py-3 hover:bg-slate-50 border-b last:border-b-0 flex items-center justify-between gap-4"
                          >
                            <span className="font-medium text-sm">{invoice.invoice_number || invoice.invoice_no || `Invoice #${invoice.id}`}</span>
                            <span className="text-xs text-slate-500 truncate">{invoice.customer?.name || invoice.customer_name || '-'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {formErrors.original_sale_id && <p className="mt-1 text-xs text-rose-600">{formErrors.original_sale_id}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                      <input type="text" value={formData.customer_name || '-'} disabled className="w-full rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm" />
                      {formErrors.customer_id && <p className="mt-1 text-xs text-rose-600">{formErrors.customer_id}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Original Invoice</label>
                      <input type="text" value={formData.original_invoice_no || '-'} disabled className="w-full rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Return Warehouse *</label>
                      <select
                        value={formData.warehouse_id}
                        disabled={isReadOnly}
                        onChange={e => setFormData(prev => ({ ...prev, warehouse_id: toNumber(e.target.value) }))}
                        className={`w-full rounded-lg border px-3 py-2 text-sm ${formErrors.warehouse_id ? 'border-rose-400' : 'border-gray-300'}`}
                      >
                        <option value={0}>Select Warehouse</option>
                        {(warehouses || []).map((warehouse: any) => (
                          <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                        ))}
                      </select>
                      {formErrors.warehouse_id && <p className="mt-1 text-xs text-rose-600">{formErrors.warehouse_id}</p>}
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Return Details
                </legend>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                    <select
                      value={formData.company_id}
                      disabled={isReadOnly}
                      onChange={e => setFormData(prev => ({ ...prev, company_id: toNumber(e.target.value), branch_id: 0 }))}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${formErrors.company_id ? 'border-rose-400' : 'border-gray-300'}`}
                    >
                      <option value={0}>Select Company</option>
                      {(companies || []).map((company: any) => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                    </select>
                    {formErrors.company_id && <p className="mt-1 text-xs text-rose-600">{formErrors.company_id}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <select
                      value={formData.branch_id}
                      disabled={isReadOnly || !formData.company_id}
                      onChange={e => setFormData(prev => ({ ...prev, branch_id: toNumber(e.target.value) }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                    >
                      <option value={0}>Select Branch</option>
                      {formBranchOptions.map((branch: any) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                    <input
                      type="date"
                      value={formData.return_date}
                      disabled={isReadOnly}
                      onChange={e => setFormData(prev => ({ ...prev, return_date: e.target.value }))}
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${formErrors.return_date ? 'border-rose-400' : 'border-gray-300'}`}
                    />
                    {formErrors.return_date && <p className="mt-1 text-xs text-rose-600">{formErrors.return_date}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Return Type</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                      <button type="button" disabled={isReadOnly} onClick={setPartialReturn} className={`flex-1 px-3 py-2 text-sm ${formData.return_type === 'partial' ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-white text-slate-600'} disabled:opacity-50`}>Partial</button>
                      <button type="button" disabled={isReadOnly} onClick={setFullReturn} className={`flex-1 px-3 py-2 text-sm border-l ${formData.return_type === 'full' ? 'bg-blue-50 text-blue-700 font-semibold' : 'bg-white text-slate-600'} disabled:opacity-50`}>Full Qty</button>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                    <input
                      type="text"
                      value={formData.reason}
                      disabled={isReadOnly}
                      onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                      placeholder="e.g. Damaged, customer return, wrong item"
                      className={`w-full rounded-lg border px-3 py-2 text-sm ${formErrors.reason ? 'border-rose-400' : 'border-gray-300'}`}
                    />
                    {formErrors.reason && <p className="mt-1 text-xs text-rose-600">{formErrors.reason}</p>}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                    <textarea
                      value={formData.remark}
                      disabled={isReadOnly}
                      onChange={e => setFormData(prev => ({ ...prev, remark: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-slate-50"
                      placeholder="Additional notes"
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Items to Return
                </legend>
                {formErrors.items && <p className="mt-2 text-xs text-rose-600">{formErrors.items}</p>}
                <div className="mt-3 overflow-x-auto">
                  {formData.items.length > 0 ? (
                    <table className="min-w-[1100px] w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase">Product</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Sold</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Returned</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Available</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Return Qty</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Rate</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">GST</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase">Condition</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-slate-500 uppercase">Restock</th>
                          <th className="px-2 py-2 text-right text-xs font-medium text-slate-500 uppercase">Total</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {formData.items.map((item, index) => {
                          const maxReturnable = Math.max(0, toNumber(item.sold_qty) - toNumber(item.already_returned_qty));
                          const overQty = toNumber(item.return_qty) > maxReturnable;
                          return (
                            <tr key={`${item.sale_item_id ?? item.product_id}-${index}`} className={overQty ? 'bg-red-50' : ''}>
                              <td className="px-2 py-2 text-sm">
                                <div className="font-medium">{item.product_name}</div>
                                {item.hsn_code && <div className="text-xs text-slate-400">HSN: {item.hsn_code}</div>}
                              </td>
                              <td className="px-2 py-2 text-sm text-right">{item.sold_qty}</td>
                              <td className="px-2 py-2 text-sm text-right">{item.already_returned_qty}</td>
                              <td className="px-2 py-2 text-sm font-medium text-right">{maxReturnable}</td>
                              <td className="px-2 py-2 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max={maxReturnable}
                                  step="1"
                                  inputMode="numeric"
                                  value={item.return_qty}
                                  disabled={isReadOnly || maxReturnable === 0}
                                  onChange={e => updateItem(index, 'return_qty', e.target.value)}
                                  className={`w-24 rounded border px-2 py-1 text-sm text-right disabled:bg-slate-50 ${formErrors[`return_qty_${index}`] || overQty ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-300'}`}
                                />
                                {formErrors[`return_qty_${index}`] && <div className="mt-1 text-[11px] text-rose-600">{formErrors[`return_qty_${index}`]}</div>}
                              </td>
                              <td className="px-2 py-2 text-sm text-right">{formatCurrency(item.rate)}</td>
                              <td className="px-2 py-2 text-sm text-right">{item.gst_rate}%</td>
                              <td className="px-2 py-2">
                                <select
                                  value={item.condition}
                                  disabled={isReadOnly || toNumber(item.return_qty) <= 0}
                                  onChange={e => updateItem(index, 'condition', e.target.value as Condition)}
                                  className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-slate-50"
                                >
                                  <option value="good">Good</option>
                                  <option value="damaged">Damaged</option>
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={item.restock_status}
                                  disabled={isReadOnly || toNumber(item.return_qty) <= 0}
                                  onChange={e => updateItem(index, 'restock_status', e.target.value as RestockStatus)}
                                  className="w-28 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-slate-50"
                                >
                                  <option value="restock">Restock</option>
                                  <option value="no_restock">No Restock</option>
                                </select>
                              </td>
                              <td className="px-2 py-2 text-sm font-medium text-right">{formatCurrency(item.total_amount)}</td>
                              <td className="px-2 py-2 text-right">
                                {!isReadOnly && (
                                  <button type="button" onClick={() => removeItem(index)} className="text-rose-500 hover:text-rose-700" title="Remove line">
                                    <FiTrash2 size={16} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="rounded-lg bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Select an original invoice to load returnable items.</div>
                  )}
                </div>
              </fieldset>

              <fieldset className="border rounded-lg p-4">
                <legend className="text-base font-semibold text-slate-700 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Refund & Totals
                </legend>
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Method</label>
                      <select
                        value={settlementMode}
                        disabled={isReadOnly}
                        onChange={e => setFormData(prev => ({ ...prev, refund_method: e.target.value as RefundMethod }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                      >
                        <option value="cash">Cash Refund</option>
                        <option value="upi">UPI Refund</option>
                        <option value="bank">Bank Transfer Refund</option>
                        <option value="credit">Credit Note</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Refund Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.refund_amount}
                        disabled={refundFieldDisabled}
                        onChange={e => setFormData(prev => ({ ...prev, refund_amount: Math.max(0, toNumber(e.target.value)) }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Credit Amount</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.credit_amount}
                        disabled={creditFieldDisabled}
                        onChange={e => setFormData(prev => ({ ...prev, credit_amount: Math.max(0, toNumber(e.target.value)) }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                      />
                    </div>
                    {formErrors.refund && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{formErrors.refund}</div>}
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 space-y-3 h-fit">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Gross Subtotal</span>
                      <span className="font-medium">{formatCurrency(totals.subtotalBeforeDiscount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Discount</span>
                      <span className="font-medium">-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Taxable Amount</span>
                      <span className="font-medium">{formatCurrency(totals.taxableAmount)}</span>
                    </div>
                    {totals.cgstAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">CGST</span><span className="font-medium">{formatCurrency(totals.cgstAmount)}</span></div>}
                    {totals.sgstAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">SGST</span><span className="font-medium">{formatCurrency(totals.sgstAmount)}</span></div>}
                    {totals.igstAmount > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500">IGST</span><span className="font-medium">{formatCurrency(totals.igstAmount)}</span></div>}
                    <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-semibold">
                      <span>Grand Total</span>
                      <span>{formatCurrency(totals.grandTotal)}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-3 flex justify-between text-sm">
                      <span className="text-slate-500">Settlement</span>
                      <span className={roundMoney(formData.refund_amount + formData.credit_amount) === totals.grandTotal ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                        {formatCurrency(toNumber(formData.refund_amount) + toNumber(formData.credit_amount))}
                      </span>
                    </div>
                  </div>
                </div>
              </fieldset>

              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
                <strong>Workflow:</strong> save as Draft → review → Confirm Return → backend atomically updates return/stock/accounting/refund state → complete only after settlement processing. This screen intentionally locks confirmed returns.
              </div>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      <style>{`
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 300_000) {
  const cache = useRef(new Map<string, { data: T; timestamp: number }>()).current;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async (skipCache = false) => {
    const requestId = ++requestRef.current;

    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        if (mountedRef.current && requestId === requestRef.current) {
          setData(entry.data);
          setError(null);
          setLoading(false);
        }
        return entry.data;
      }
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetcherRef.current();
      const result = unwrapApiData<T>(response, ([] as unknown) as T);
      cache.set(key, { data: result, timestamp: Date.now() });

      if (mountedRef.current && requestId === requestRef.current) {
        setData(result);
        setError(null);
      }
      return result;
    } catch (err) {
      if (mountedRef.current && requestId === requestRef.current) {
        setError(getApiErrorMessage(err, 'Failed to load data.'));
      }
      return null;
    } finally {
      if (mountedRef.current && requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, [cache, key, ttlMs]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);
  return { data, loading, error, refresh };
}