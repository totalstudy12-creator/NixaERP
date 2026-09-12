import type { Dispatch, ElementType, SetStateAction } from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleDollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Loader2,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  Boxes,
} from 'lucide-react';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas })),
);

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

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

const RETURN_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'stock_updated', label: 'Stock updated' },
  { value: 'refund_pending', label: 'Refund pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const ROWS_PER_PAGE = 10;
const TABLE_COLUMN_COUNT = 9;

interface SalesReturnItem {
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
}

interface SalesReturn {
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
}

interface ReturnItemForm {
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
  original_discount_amount: number;
  original_taxable_amount: number;
  original_cgst_amount: number;
  original_sgst_amount: number;
  original_igst_amount: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  condition: Condition;
  restock_status: RestockStatus;
  reason?: string;
}

interface FormState {
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
}

interface AppLogEntry {
  module: string;
  action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}

/* ------------------------------------------------------------------ */
/* Safe helpers                                                        */
/* ------------------------------------------------------------------ */

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
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function safeLog(entry: AppLogEntry): void {
  try {
    addAppLog(entry);
  } catch {
    /* no-op */
  }
}

/* ------------------------------------------------------------------ */
/* Item math                                                           */
/* ------------------------------------------------------------------ */

function calculateItem(item: ReturnItemForm, nextQty?: number): ReturnItemForm {
  const soldQty = Math.max(0, toNumber(item.sold_qty));
  const alreadyReturned = Math.max(0, toNumber(item.already_returned_qty));
  const maxReturnable = Math.max(0, soldQty - alreadyReturned);
  const qty = Math.min(maxReturnable, Math.max(0, toNumber(nextQty ?? item.return_qty)));

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
    return {
      ...item,
      return_qty: qty,
      discount_amount: discountAmount,
      taxable_amount: taxableAmount,
      cgst_amount: cgstAmount,
      sgst_amount: sgstAmount,
      igst_amount: igstAmount,
      total_amount: roundMoney(taxableAmount + tax),
    };
  }

  const rate = Math.max(0, toNumber(item.rate));
  const gstRate = Math.max(0, toNumber(item.gst_rate));
  const taxableAmount = roundMoney(qty * rate);
  const gstAmount = roundMoney((taxableAmount * gstRate) / 100);
  const useIGST =
    toNumber(item.original_igst_amount) > 0 &&
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

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

function statusBadgeClasses(status: ReturnStatus): string {
  switch (status) {
    case 'draft': return 'border-slate-200 bg-slate-50 text-slate-700';
    case 'confirmed': return 'border-indigo-200/70 bg-indigo-50 text-indigo-700';
    case 'stock_updated': return 'border-violet-200/70 bg-violet-50 text-violet-700';
    case 'refund_pending': return 'border-amber-200/70 bg-amber-50 text-amber-700';
    case 'completed': return 'border-emerald-200/70 bg-emerald-50 text-emerald-700';
    case 'cancelled': return 'border-rose-200/70 bg-rose-50 text-rose-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

function refundBadgeClasses(status: RefundStatus): string {
  switch (status) {
    case 'pending': return 'border-amber-200/70 bg-amber-50 text-amber-700';
    case 'refunded': return 'border-emerald-200/70 bg-emerald-50 text-emerald-700';
    case 'credited': return 'border-indigo-200/70 bg-indigo-50 text-indigo-700';
    case 'partial': return 'border-orange-200/70 bg-orange-50 text-orange-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-700';
  }
}

const statusDot: Record<ReturnStatus, string> = {
  draft: 'bg-slate-400',
  confirmed: 'bg-indigo-500',
  stock_updated: 'bg-violet-500',
  refund_pending: 'bg-amber-500',
  completed: 'bg-emerald-500',
  cancelled: 'bg-rose-500',
};

const refundDot: Record<RefundStatus, string> = {
  pending: 'bg-amber-500',
  refunded: 'bg-emerald-500',
  credited: 'bg-indigo-500',
  partial: 'bg-orange-500',
};

function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusBadgeClasses(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusDot[status] ?? 'bg-slate-400'}`} />
      {formatStatus(status)}
    </Badge>
  );
}

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  return (
    <Badge variant="outline" className={`gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${refundBadgeClasses(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${refundDot[status] ?? 'bg-slate-400'}`} />
      {formatStatus(status)}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({ title, value, icon: Icon, accent = 'indigo', hint }: {
  title: string;
  value: string | number;
  icon: ElementType;
  accent?: 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet';
  hint?: string;
}) {
  const accents: Record<string, { ring: string; icon: string; bg: string }> = {
    indigo: { ring: 'ring-indigo-500/10', icon: 'text-indigo-600', bg: 'bg-indigo-50' },
    emerald: { ring: 'ring-emerald-500/10', icon: 'text-emerald-600', bg: 'bg-emerald-50' },
    rose: { ring: 'ring-rose-500/10', icon: 'text-rose-600', bg: 'bg-rose-50' },
    amber: { ring: 'ring-amber-500/10', icon: 'text-amber-600', bg: 'bg-amber-50' },
    violet: { ring: 'ring-violet-500/10', icon: 'text-violet-600', bg: 'bg-violet-50' },
  };
  const s = accents[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
          {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${s.bg} ring-1 ${s.ring}`}>
          <Icon className={`h-5 w-5 ${s.icon}`} />
        </div>
      </div>
    </div>
  );
}

function NativeSelect({ value, onChange, options, disabled, ariaLabel, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Offcanvas form                                                      */
/* ------------------------------------------------------------------ */

interface FormPanelProps {
  isOpen: boolean;
  isReadOnly: boolean;
  viewingId: number | null;
  editingId: number | null;
  selectedReturn: SalesReturn | null;
  formData: FormState;
  setFormData: Dispatch<SetStateAction<FormState>>;
  formErrors: Record<string, string>;
  submitting: boolean;
  warehouses: any[];
  companies: any[];
  formBranchOptions: any[];
  invoiceSearchQuery: string;
  invoiceSearchResults: any[];
  showInvoiceDropdown: boolean;
  invoiceSearchLoading: boolean;
  totals: {
    subtotalBeforeDiscount: number;
    discountAmount: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalTax: number;
    grandTotal: number;
  };
  onClose: () => void;
  onSubmit: (target: 'draft' | 'confirmed') => void;
  onInvoiceSearchChange: (value: string) => void;
  onLoadInvoice: (id: number) => void;
  onUpdateItem: (index: number, field: keyof ReturnItemForm, value: any) => void;
  onRemoveItem: (index: number) => void;
  onSetFullReturn: () => void;
  onSetPartialReturn: () => void;
}

function FormPanel(props: FormPanelProps) {
  const {
    isOpen, isReadOnly, viewingId, editingId, selectedReturn,
    formData, setFormData, formErrors, submitting,
    warehouses, companies, formBranchOptions,
    invoiceSearchQuery, invoiceSearchResults, showInvoiceDropdown, invoiceSearchLoading,
    totals, onClose, onSubmit, onInvoiceSearchChange, onLoadInvoice,
    onUpdateItem, onRemoveItem, onSetFullReturn, onSetPartialReturn,
  } = props;

  const refundFieldDisabled = isReadOnly || formData.refund_method === 'credit';
  const creditFieldDisabled = isReadOnly || formData.refund_method !== 'credit';

  const fieldLabel = 'block text-xs font-medium text-slate-600 mb-1.5';
  const fieldInput =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 disabled:text-slate-400';
  const fieldInputError = 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20';

  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
            <span className="text-sm text-slate-600">Loading form…</span>
          </div>
        </div>
      }
    >
      <Offcanvas
        isOpen={isOpen}
        title={
          viewingId
            ? `View Return ${selectedReturn?.return_number || ''}`
            : editingId
              ? 'Edit Draft Return'
              : 'Create Sales Return'
        }
        onClose={onClose}
        className="sales-return-offcanvas"
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {viewingId
                ? `Status: ${formatStatus(selectedReturn?.status || '')}`
                : 'Confirmed returns become financial / stock transactions and cannot be hard-deleted.'}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting} className="rounded-xl">
                <X className="mr-2 h-4 w-4" /> Close
              </Button>
              {!isReadOnly && (
                <>
                  <Button variant="outline" onClick={() => onSubmit('draft')} disabled={submitting} className="rounded-xl">
                    <FileText className="mr-2 h-4 w-4" />
                    {submitting ? 'Saving…' : 'Save draft'}
                  </Button>
                  <Button
                    onClick={() => onSubmit('confirmed')}
                    disabled={submitting}
                    className="rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-700"
                  >
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {submitting ? 'Processing…' : 'Confirm return'}
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        <div className="sales-return-form-scroll space-y-5 pr-1">
          {isReadOnly && !viewingId && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>This return is locked because it has already moved beyond draft status.</span>
            </div>
          )}

          {/* Original sale */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-indigo-500" /> Original sale
            </legend>
            <div className="mt-3 space-y-4">
              <div className="relative">
                <label className={fieldLabel}>Search invoice *</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={invoiceSearchQuery}
                    onChange={(e) => onInvoiceSearchChange(e.target.value)}
                    placeholder="Enter invoice number…"
                    disabled={isReadOnly || !!editingId}
                    className={`${fieldInput} pl-10 ${formErrors.original_sale_id ? fieldInputError : ''}`}
                  />
                </div>
                {showInvoiceDropdown && !isReadOnly && !editingId && (
                  <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {invoiceSearchLoading ? (
                      <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" /> Searching…
                      </div>
                    ) : invoiceSearchResults.length === 0 ? (
                      <div className="p-4 text-sm text-slate-500">No eligible invoices found.</div>
                    ) : (
                      invoiceSearchResults.map((invoice) => (
                        <button
                          key={invoice.id}
                          type="button"
                          onClick={() => onLoadInvoice(toNumber(invoice.id))}
                          className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-slate-50"
                        >
                          <span className="font-semibold text-slate-800">
                            {invoice.invoice_number || invoice.invoice_no || `Invoice #${invoice.id}`}
                          </span>
                          <span className="truncate text-xs text-slate-500">
                            {invoice.customer?.name || invoice.customer_name || '—'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
                {formErrors.original_sale_id && (
                  <p className="mt-1 text-xs text-rose-600">{formErrors.original_sale_id}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={fieldLabel}>Customer</label>
                  <input type="text" value={formData.customer_name || '—'} disabled className={`${fieldInput} bg-slate-50`} />
                </div>
                <div>
                  <label className={fieldLabel}>Original invoice</label>
                  <input type="text" value={formData.original_invoice_no || '—'} disabled className={`${fieldInput} bg-slate-50 font-mono`} />
                </div>
                <div>
                  <label className={fieldLabel}>Return warehouse *</label>
                  <NativeSelect
                    value={String(formData.warehouse_id || '')}
                    onChange={(v) => setFormData((p) => ({ ...p, warehouse_id: toNumber(v) }))}
                    disabled={isReadOnly}
                    ariaLabel="Return warehouse"
                    options={[
                      { value: '', label: 'Select warehouse' },
                      ...(warehouses || []).map((w: any) => ({ value: String(w.id), label: w.name })),
                    ]}
                  />
                  {formErrors.warehouse_id && <p className="mt-1 text-xs text-rose-600">{formErrors.warehouse_id}</p>}
                </div>
              </div>
            </div>
          </fieldset>

          {/* Return details */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Return details
            </legend>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className={fieldLabel}>Company *</label>
                <NativeSelect
                  value={String(formData.company_id || '')}
                  onChange={(v) => setFormData((p) => ({ ...p, company_id: toNumber(v), branch_id: 0 }))}
                  disabled={isReadOnly}
                  ariaLabel="Company"
                  options={[
                    { value: '', label: 'Select company' },
                    ...(companies || []).map((c: any) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
                {formErrors.company_id && <p className="mt-1 text-xs text-rose-600">{formErrors.company_id}</p>}
              </div>
              <div>
                <label className={fieldLabel}>Branch</label>
                <NativeSelect
                  value={String(formData.branch_id || '')}
                  onChange={(v) => setFormData((p) => ({ ...p, branch_id: toNumber(v) }))}
                  disabled={isReadOnly || !formData.company_id}
                  ariaLabel="Branch"
                  options={[
                    { value: '', label: 'Select branch' },
                    ...formBranchOptions.map((b: any) => ({ value: String(b.id), label: b.name })),
                  ]}
                />
              </div>
              <div>
                <label className={fieldLabel}>Return date *</label>
                <input
                  type="date"
                  value={formData.return_date}
                  disabled={isReadOnly}
                  onChange={(e) => setFormData((p) => ({ ...p, return_date: e.target.value }))}
                  className={`${fieldInput} ${formErrors.return_date ? fieldInputError : ''}`}
                />
                {formErrors.return_date && <p className="mt-1 text-xs text-rose-600">{formErrors.return_date}</p>}
              </div>
              <div>
                <label className={fieldLabel}>Return type</label>
                <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={onSetPartialReturn}
                    className={`flex-1 px-3 py-2.5 text-sm font-medium transition ${
                      formData.return_type === 'partial'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    } disabled:opacity-50`}
                  >
                    Partial
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={onSetFullReturn}
                    className={`flex-1 border-l border-slate-200 px-3 py-2.5 text-sm font-medium transition ${
                      formData.return_type === 'full'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-white text-slate-600 hover:bg-slate-50'
                    } disabled:opacity-50`}
                  >
                    Full quantity
                  </button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={fieldLabel}>Reason *</label>
                <input
                  type="text"
                  value={formData.reason}
                  disabled={isReadOnly}
                  onChange={(e) => setFormData((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="e.g. Damaged, customer return, wrong item"
                  className={`${fieldInput} ${formErrors.reason ? fieldInputError : ''}`}
                />
                {formErrors.reason && <p className="mt-1 text-xs text-rose-600">{formErrors.reason}</p>}
              </div>
              <div className="md:col-span-2">
                <label className={fieldLabel}>Remark</label>
                <textarea
                  value={formData.remark}
                  disabled={isReadOnly}
                  onChange={(e) => setFormData((p) => ({ ...p, remark: e.target.value }))}
                  rows={2}
                  placeholder="Additional notes"
                  className={`${fieldInput} min-h-[70px] resize-y`}
                />
              </div>
            </div>
          </fieldset>

          {/* Items */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-violet-500" /> Items to return
            </legend>
            {formErrors.items && <p className="mt-2 text-xs text-rose-600">{formErrors.items}</p>}
            <div className="mt-3 -mx-4 overflow-x-auto sm:mx-0">
              {formData.items.length > 0 ? (
                <table className="min-w-[1100px] w-full">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-2 py-2 text-right">Sold</th>
                      <th className="px-2 py-2 text-right">Returned</th>
                      <th className="px-2 py-2 text-right">Available</th>
                      <th className="px-2 py-2 text-right">Return qty</th>
                      <th className="px-2 py-2 text-right">Rate</th>
                      <th className="px-2 py-2 text-right">GST</th>
                      <th className="px-2 py-2">Condition</th>
                      <th className="px-2 py-2">Restock</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {formData.items.map((item, index) => {
                      const maxReturnable = Math.max(0, toNumber(item.sold_qty) - toNumber(item.already_returned_qty));
                      const overQty = toNumber(item.return_qty) > maxReturnable;
                      const rowHasError = Boolean(formErrors[`return_qty_${index}`]) || overQty;
                      return (
                        <tr key={`${item.sale_item_id ?? item.product_id}-${index}`} className={overQty ? 'bg-rose-50/50' : ''}>
                          <td className="px-3 py-2.5">
                            <p className="text-sm font-medium text-slate-800">{item.product_name}</p>
                            {item.hsn_code && <p className="text-[11px] text-slate-400">HSN: {item.hsn_code}</p>}
                          </td>
                          <td className="px-2 py-2.5 text-right text-sm text-slate-600 tabular-nums">{item.sold_qty}</td>
                          <td className="px-2 py-2.5 text-right text-sm text-slate-600 tabular-nums">{item.already_returned_qty}</td>
                          <td className="px-2 py-2.5 text-right text-sm font-semibold text-slate-800 tabular-nums">{maxReturnable}</td>
                          <td className="px-2 py-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              max={maxReturnable}
                              step={1}
                              inputMode="numeric"
                              value={item.return_qty}
                              disabled={isReadOnly || maxReturnable === 0}
                              onChange={(e) => onUpdateItem(index, 'return_qty', e.target.value)}
                              className={`w-20 rounded-lg border px-2 py-1.5 text-right text-sm tabular-nums outline-none transition ${
                                rowHasError
                                  ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                                  : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20'
                              } disabled:bg-slate-50`}
                            />
                            {formErrors[`return_qty_${index}`] && (
                              <p className="mt-1 text-[10px] text-rose-600">{formErrors[`return_qty_${index}`]}</p>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right text-sm text-slate-600 tabular-nums">{formatCurrency(item.rate)}</td>
                          <td className="px-2 py-2.5 text-right text-sm text-slate-600 tabular-nums">{item.gst_rate}%</td>
                          <td className="px-2 py-2.5">
                            <select
                              value={item.condition}
                              disabled={isReadOnly || toNumber(item.return_qty) <= 0}
                              onChange={(e) => onUpdateItem(index, 'condition', e.target.value as Condition)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                            >
                              <option value="good">Good</option>
                              <option value="damaged">Damaged</option>
                            </select>
                          </td>
                          <td className="px-2 py-2.5">
                            <select
                              value={item.restock_status}
                              disabled={isReadOnly || toNumber(item.return_qty) <= 0}
                              onChange={(e) => onUpdateItem(index, 'restock_status', e.target.value as RestockStatus)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50"
                            >
                              <option value="restock">Restock</option>
                              <option value="no_restock">No restock</option>
                            </select>
                          </td>
                          <td className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatCurrency(item.total_amount)}
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            {!isReadOnly && (
                              <button
                                type="button"
                                onClick={() => onRemoveItem(index)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                                aria-label="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
                  <Boxes className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">No items loaded</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Search and select an original invoice to load returnable items.
                  </p>
                </div>
              )}
            </div>
          </fieldset>

          {/* Settlement */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Refund &amp; totals
            </legend>
            <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className={fieldLabel}>Settlement method</label>
                  <NativeSelect
                    value={formData.refund_method}
                    onChange={(v) => {
                      const method = v as RefundMethod;
                      setFormData((p) => ({
                        ...p,
                        refund_method: method,
                        refund_amount: method === 'credit' ? 0 : totals.grandTotal,
                        credit_amount: method === 'credit' ? totals.grandTotal : 0,
                      }));
                    }}
                    disabled={isReadOnly}
                    ariaLabel="Settlement method"
                    options={[
                      { value: 'credit', label: 'Credit note' },
                      { value: 'cash', label: 'Cash refund' },
                      { value: 'upi', label: 'UPI refund' },
                      { value: 'bank', label: 'Bank transfer refund' },
                    ]}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Refund amount</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.refund_amount}
                    disabled={refundFieldDisabled}
                    onChange={(e) => setFormData((p) => ({ ...p, refund_amount: Math.max(0, toNumber(e.target.value)) }))}
                    className={`${fieldInput} text-right tabular-nums`}
                  />
                </div>
                <div>
                  <label className={fieldLabel}>Credit amount</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.credit_amount}
                    disabled={creditFieldDisabled}
                    onChange={(e) => setFormData((p) => ({ ...p, credit_amount: Math.max(0, toNumber(e.target.value)) }))}
                    className={`${fieldInput} text-right tabular-nums`}
                  />
                </div>
                {formErrors.refund && (
                  <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{formErrors.refund}</span>
                  </div>
                )}
              </div>

              <div className="h-fit space-y-3 rounded-xl bg-slate-50 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Gross subtotal</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totals.subtotalBeforeDiscount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Discount</span>
                  <span className="font-medium tabular-nums">−{formatCurrency(totals.discountAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Taxable amount</span>
                  <span className="font-medium tabular-nums">{formatCurrency(totals.taxableAmount)}</span>
                </div>
                {totals.cgstAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">CGST</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totals.cgstAmount)}</span>
                  </div>
                )}
                {totals.sgstAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">SGST</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totals.sgstAmount)}</span>
                  </div>
                )}
                {totals.igstAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">IGST</span>
                    <span className="font-medium tabular-nums">{formatCurrency(totals.igstAmount)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-base font-bold text-slate-900">
                  <span>Grand total</span>
                  <span className="tabular-nums">{formatCurrency(totals.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Settlement</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      roundMoney(formData.refund_amount + formData.credit_amount) === totals.grandTotal
                        ? 'text-emerald-600'
                        : 'text-amber-600'
                    }`}
                  >
                    {formatCurrency(formData.refund_amount + formData.credit_amount)}
                  </span>
                </div>
              </div>
            </div>
          </fieldset>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-800">
            <strong>Workflow:</strong> save as <em>draft</em> → review → <em>confirm return</em>. The backend
            atomically updates return, stock, accounting and refund state on confirmation, so processed returns
            are intentionally locked from editing and deletion.
          </div>
        </div>
      </Offcanvas>
    </Suspense>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function SalesInvoiceReturnPage() {
  const { showSuccess, showError } = useNotification();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormState>({
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
  });
  const [submitting, setSubmitting] = useState(false);
  const [openingReturnId, setOpeningReturnId] = useState<number | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { data: returns, loading, error, refresh } = useApiCache<SalesReturn[]>(
    'sales-returns-list',
    () => apiClient.getSalesInvoiceReturns()
  );

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

  const returnList = useMemo(() => (Array.isArray(returns) ? returns : []), [returns]);

  const selectedReturn = useMemo(
    () => returnList.find((item) => item.id === viewingId) || null,
    [returnList, viewingId]
  );

  const isReadOnly = Boolean(viewingId) || Boolean(
    editingId && !EDITABLE_STATUSES.includes(returnList.find((i) => i.id === editingId)?.status || 'draft')
  );

  const filteredReturns = useMemo(() => {
    let list = [...returnList];
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      list = list.filter(
        (r) =>
          r.return_number?.toLowerCase().includes(term) ||
          r.original_invoice_no?.toLowerCase().includes(term) ||
          r.customer?.name?.toLowerCase().includes(term) ||
          r.reason?.toLowerCase().includes(term)
      );
    }
    if (filterStatus !== 'all') list = list.filter((r) => r.status === filterStatus);
    if (filterCompany !== 'all') list = list.filter((r) => toNumber(r.company_id) === Number(filterCompany));
    if (filterBranch !== 'all') list = list.filter((r) => toNumber(r.branch_id) === Number(filterBranch));
    return list;
  }, [returnList, searchTerm, filterStatus, filterCompany, filterBranch]);

  const totalPages = Math.max(1, Math.ceil(filteredReturns.length / ROWS_PER_PAGE));

  const paginatedReturns = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    return filteredReturns.slice(start, start + ROWS_PER_PAGE);
  }, [filteredReturns, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterCompany, filterBranch]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => () => {
    if (invoiceDebounceRef.current) clearTimeout(invoiceDebounceRef.current);
  }, []);

  const summary = useMemo(
    () => ({
      total: returnList.length,
      pending: returnList.filter((r) =>
        ['draft', 'confirmed', 'stock_updated', 'refund_pending'].includes(r.status)
      ).length,
      completed: returnList.filter((r) => r.status === 'completed').length,
      totalRefund: returnList.reduce((sum, r) => sum + toNumber(r.refund_amount), 0),
      totalCredit: returnList.reduce((sum, r) => sum + toNumber(r.credit_amount), 0),
    }),
    [returnList]
  );

  const totals = useMemo(() => {
    const subtotalBeforeDiscount = formData.items.reduce(
      (sum, item) => sum + toNumber(item.return_qty) * toNumber(item.rate),
      0
    );
    const discountAmount = formData.items.reduce((s, i) => s + toNumber(i.discount_amount), 0);
    const taxableAmount = formData.items.reduce((s, i) => s + toNumber(i.taxable_amount), 0);
    const cgstAmount = formData.items.reduce((s, i) => s + toNumber(i.cgst_amount), 0);
    const sgstAmount = formData.items.reduce((s, i) => s + toNumber(i.sgst_amount), 0);
    const igstAmount = formData.items.reduce((s, i) => s + toNumber(i.igst_amount), 0);
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
    setFormData({
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
    });
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
    const originalTaxable =
      item.taxable_amount !== undefined
        ? toNumber(item.taxable_amount)
        : roundMoney(soldQty * toNumber(item.rate) - originalDiscount);

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
      original_cgst_amount: toNumber(item.original_cgst_amount ?? item.cgst_amount),
      original_sgst_amount: toNumber(item.original_sgst_amount ?? item.sgst_amount),
      original_igst_amount: toNumber(item.original_igst_amount ?? item.igst_amount),
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

  const loadInvoiceDetails = useCallback(
    async (invoiceId: number) => {
      setInvoiceSearchLoading(true);
      try {
        const result = await apiClient.getInvoiceDetailsForReturn(invoiceId);
        const invoice = unwrapApiData<any>(result, null);
        if (!invoice?.id) throw new Error('Invoice details were not returned by the server.');

        const invoiceItems = Array.isArray(invoice.items) ? invoice.items : [];
        const items = invoiceItems.map(createItemFromInvoice);

        setFormData((prev) => ({
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
        setFormErrors((prev) => {
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
    },
    [createItemFromInvoice, showError]
  );

  const handleInvoiceSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setInvoiceSearchQuery(query);
      setFormErrors((prev) => {
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
    },
    [showError]
  );

  const handleCreate = useCallback(() => {
    resetForm();
    setIsPanelOpen(true);
  }, [resetForm]);

  const buildItemsFromReturn = useCallback(
    (items: SalesReturnItem[]): ReturnItemForm[] =>
      items.map((item) => ({
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
    []
  );

  const hydrateReturnForm = useCallback(
    async (returnItem: SalesReturn, allowEdit: boolean) => {
      if (allowEdit && !EDITABLE_STATUSES.includes(returnItem.status)) {
        return;
      }

      setOpeningReturnId(returnItem.id);
      try {
        let invoiceItems: any[] = [];
        let invoice: any = null;

        if (returnItem.original_sale_id) {
          const result = await apiClient.getInvoiceDetailsForReturn(toNumber(returnItem.original_sale_id));
          invoice = unwrapApiData<any>(result, null);
          invoiceItems = Array.isArray(invoice?.items) ? invoice.items : [];
        }

        const existingBySaleItem = new Map<number, SalesReturnItem>(
          (returnItem.items || [])
            .filter((item) => Number.isInteger(Number(item.sale_item_id)))
            .map((item) => [toNumber(item.sale_item_id), item])
        );

        const hydratedItems: ReturnItemForm[] = invoiceItems.length
          ? invoiceItems.map((invoiceItem) => {
              const base = createItemFromInvoice(invoiceItem);
              const existing = existingBySaleItem.get(toNumber(invoiceItem.id));
              if (!existing) return base;

              return calculateItem(
                {
                  ...base,
                  return_qty: Math.max(0, toNumber(existing.return_qty)),
                  condition: existing.condition || 'good',
                  restock_status: existing.restock_status || 'restock',
                  reason: existing.reason || '',
                },
                toNumber(existing.return_qty)
              );
            })
          : buildItemsFromReturn(returnItem.items || []);

        setViewingId(allowEdit ? null : returnItem.id);
        setEditingId(allowEdit ? returnItem.id : null);
        setFormData({
          company_id: toNumber(returnItem.company_id) || toNumber(invoice?.company_id),
          branch_id: toNumber(returnItem.branch_id) || toNumber(invoice?.branch_id),
          warehouse_id: toNumber(returnItem.warehouse_id) || toNumber(invoice?.warehouse_id),
          customer_id: toNumber(returnItem.customer_id) || toNumber(invoice?.customer_id),
          customer_name: returnItem.customer?.name || invoice?.customer?.name || '',
          original_sale_id: toNumber(returnItem.original_sale_id) || toNumber(invoice?.id) || null,
          original_invoice_no:
            returnItem.original_invoice_no ||
            invoice?.invoice_number ||
            invoice?.invoice_no ||
            (invoice?.id ? `INV-${invoice.id}` : ''),
          return_date: returnItem.return_date || todayLocalISO(),
          return_type:
            returnItem.items && returnItem.items.length &&
            returnItem.items.every(
              (item) => toNumber(item.return_qty) >= Math.max(0, toNumber(item.sold_qty) - toNumber(item.already_returned_qty))
            )
              ? 'full'
              : 'partial',
          reason: returnItem.reason || '',
          remark: returnItem.remark || '',
          refund_method: returnItem.refund_amount > 0 ? 'cash' : 'credit',
          refund_amount: toNumber(returnItem.refund_amount),
          credit_amount: toNumber(returnItem.credit_amount),
          items: hydratedItems,
        });
        setFormErrors({});
        setInvoiceSearchQuery(
          returnItem.original_invoice_no ||
          invoice?.invoice_number ||
          invoice?.invoice_no ||
          ''
        );
        setInvoiceSearchResults([]);
        setShowInvoiceDropdown(false);
        setIsPanelOpen(true);
      } catch (err) {
        showError('Return load failed', getApiErrorMessage(err, 'Unable to load the return details.'));
      } finally {
        setOpeningReturnId(null);
      }
    },
    [buildItemsFromReturn, createItemFromInvoice, showError]
  );

  const handleView = useCallback(
    (returnItem: SalesReturn) => {
      void hydrateReturnForm(returnItem, false);
    },
    [hydrateReturnForm]
  );

  const handleEdit = useCallback(
    (returnItem: SalesReturn) => {
      if (!EDITABLE_STATUSES.includes(returnItem.status)) {
        void hydrateReturnForm(returnItem, false).then(() => {
          showError(
            'Return is locked',
            'Only draft returns can be edited. Confirmed or processed returns require the reversal workflow.'
          );
        });
        return;
      }
      void hydrateReturnForm(returnItem, true);
    },
    [hydrateReturnForm, showError]
  );

  const handleDelete = useCallback(
    async (returnItem: SalesReturn) => {
      if (!DELETABLE_STATUSES.includes(returnItem.status)) {
        showError('Delete blocked', 'Only draft returns can be deleted. Processed returns must not be hard-deleted.');
        return;
      }
      if (!window.confirm(`Delete draft return ${returnItem.return_number}? This cannot be undone.`)) return;
      try {
        await apiClient.deleteSalesInvoiceReturn(returnItem.id);
        showSuccess('Draft deleted', `${returnItem.return_number} was deleted.`);
        safeLog({
          module: 'Sales Invoice Return',
          action: 'Delete',
          status: 'success',
          message: `Deleted draft ${returnItem.return_number}`,
        });
        await refresh();
      } catch (err) {
        showError('Delete failed', getApiErrorMessage(err, 'Unable to delete the return.'));
      }
    },
    [refresh, showError, showSuccess]
  );

  const updateItem = useCallback(
    (index: number, field: keyof ReturnItemForm, value: any) => {
      if (isReadOnly) return;
      setFormData((prev) => {
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
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next[`return_qty_${index}`];
          return next;
        });
      }
    },
    [isReadOnly]
  );

  const removeItem = useCallback(
    (index: number) => {
      if (isReadOnly) return;
      setFormData((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
    },
    [isReadOnly]
  );

  const setFullReturn = useCallback(() => {
    if (isReadOnly) return;
    setFormData((prev) => ({
      ...prev,
      return_type: 'full',
      items: prev.items.map((item) =>
        calculateItem(item, Math.max(0, item.sold_qty - item.already_returned_qty))
      ),
    }));
  }, [isReadOnly]);

  const setPartialReturn = useCallback(() => {
    if (isReadOnly) return;
    setFormData((prev) => ({ ...prev, return_type: 'partial' }));
  }, [isReadOnly]);

  const validateForm = useCallback(
    (targetStatus: 'draft' | 'confirmed'): boolean => {
      const errors: Record<string, string> = {};
      const hasPositiveQty = formData.items.some((i) => toNumber(i.return_qty) > 0);

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
        if (qty > maxReturnable) errors[`return_qty_${index}`] = `Max returnable quantity is ${maxReturnable}.`;
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
            errors.refund = 'Credit note requires the full return amount as credit.';
          }
        } else if (creditAmount !== 0 || refundAmount !== totals.grandTotal) {
          errors.refund = `${formatStatus(formData.refund_method)} requires the full return amount as refund.`;
        }
      }

      setFormErrors(errors);
      if (Object.keys(errors).length) {
        showError('Validation failed', Object.values(errors)[0]);
        return false;
      }
      return true;
    },
    [formData, showError, totals.grandTotal]
  );

  const buildPayload = useCallback(
    (targetStatus: 'draft' | 'confirmed') => ({
      company_id: formData.company_id,
      branch_id: formData.branch_id || null,
      warehouse_id: formData.warehouse_id,
      customer_id: formData.customer_id,
      original_sale_id: formData.original_sale_id,
      return_date: formData.return_date,
      return_type: formData.return_type,
      reason: formData.reason.trim(),
      remark: formData.remark.trim() || null,
      status: targetStatus,
      refund_method: formData.refund_method,
      refund_amount: roundMoney(formData.refund_amount),
      credit_amount: roundMoney(formData.credit_amount),
      items: formData.items
        .filter((item) => toNumber(item.return_qty) > 0)
        .map((item) => ({
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
    }),
    [formData]
  );

  const handleSubmit = useCallback(
    async (targetStatus: 'draft' | 'confirmed') => {
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
          safeLog({
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
          safeLog({
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
        safeLog({
          module: 'Sales Invoice Return',
          action: targetStatus === 'confirmed' ? 'Confirm' : 'Save Draft',
          status: 'error',
          message: getApiErrorMessage(err, 'Unable to save the sales return.'),
        });
      } finally {
        setSubmitting(false);
      }
    },
    [buildPayload, editingId, isReadOnly, refresh, showError, showSuccess, submitting, validateForm]
  );

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
    const rows = filteredReturns.map((r) => [
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
    const csv =
      '\uFEFF' +
      [headers.map(csvValue).join(','), ...rows.map((row) => row.map(csvValue).join(','))].join('\r\n');
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

  const branchOptions = useMemo(
    () =>
      (branches || []).filter(
        (branch: any) =>
          filterCompany === 'all' || toNumber(branch.company_id) === Number(filterCompany)
      ),
    [branches, filterCompany]
  );

  const formBranchOptions = useMemo(
    () =>
      (branches || []).filter(
        (branch: any) => toNumber(branch.company_id) === formData.company_id
      ),
    [branches, formData.company_id]
  );

  const activeFilterCount = [
    searchTerm,
    filterStatus !== 'all' ? filterStatus : undefined,
    filterCompany !== 'all' ? filterCompany : undefined,
    filterBranch !== 'all' ? filterBranch : undefined,
  ].filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterCompany('all');
    setFilterBranch('all');
  }, []);

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
      <style>{`
        .sales-return-offcanvas {
          width: min(1150px, 96vw) !important;
          max-width: min(1150px, 96vw) !important;
        }
        @media (max-width: 640px) {
          .sales-return-offcanvas { width: 100vw !important; max-width: 100vw !important; }
        }
        .sales-return-form-scroll {
          overflow-y: auto;
          min-height: 0;
          max-height: calc(100vh - 180px);
          scrollbar-width: thin;
          scrollbar-color: #cbd5e1 transparent;
        }
        .sales-return-form-scroll::-webkit-scrollbar { width: 8px; }
        .sales-return-form-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
        .sales-return-form-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>

      <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                <Sparkles className="h-3 w-3" />
                Sales · Returns
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                Sales returns workspace
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                Reverse sales, restock inventory and settle refunds with a full audit trail.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void refresh()}
                disabled={loading}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={!filteredReturns.length}
                className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
              <Button
                onClick={handleCreate}
                className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300"
              >
                <Plus className="mr-2 h-4 w-4" />
                New return
              </Button>
            </div>
          </div>
        </section>

        {/* KPI */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          <KpiCard
            title="Total returns"
            value={loading ? '…' : summary.total.toLocaleString('en-IN')}
            icon={FileText}
            accent="indigo"
          />
          <KpiCard
            title="In progress"
            value={loading ? '…' : summary.pending.toLocaleString('en-IN')}
            icon={AlertCircle}
            accent="amber"
          />
          <KpiCard
            title="Completed"
            value={loading ? '…' : summary.completed.toLocaleString('en-IN')}
            icon={PackageCheck}
            accent="emerald"
          />
          <KpiCard
            title="Refunded"
            value={loading ? '…' : formatCurrency(summary.totalRefund)}
            icon={CircleDollarSign}
            accent="rose"
            hint={
              summary.totalCredit > 0
                ? `+ ${formatCurrency(summary.totalCredit)} credited`
                : undefined
            }
          />
        </section>

        {/* Filters */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <Filter className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Filters</p>
                <p className="text-[11px] text-slate-500">
                  {activeFilterCount > 0
                    ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                    : 'Refine returns by status, company or branch'}
                </p>
              </div>
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 rounded-lg text-slate-500 hover:text-slate-800"
                onClick={clearFilters}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </CardHeader>

          <CardContent className="bg-white p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-12">
              <div className="relative lg:col-span-4">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 rounded-xl border-slate-200 pl-10 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                  placeholder="Search return, invoice, customer, reason…"
                  autoComplete="off"
                />
              </div>

              <div className="lg:col-span-3">
                <NativeSelect
                  value={filterStatus}
                  onChange={setFilterStatus}
                  ariaLabel="Status"
                  options={RETURN_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>

              <div className="lg:col-span-2">
                <NativeSelect
                  value={filterCompany}
                  onChange={(v) => {
                    setFilterCompany(v);
                    setFilterBranch('all');
                  }}
                  ariaLabel="Company"
                  options={[
                    { value: 'all', label: 'All companies' },
                    ...(companies || []).map((c: any) => ({ value: String(c.id), label: c.name })),
                  ]}
                />
              </div>

              <div className="lg:col-span-3">
                <NativeSelect
                  value={filterBranch}
                  onChange={setFilterBranch}
                  ariaLabel="Branch"
                  options={[
                    { value: 'all', label: 'All branches' },
                    ...branchOptions.map((b: any) => ({ value: String(b.id), label: b.name })),
                  ]}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800 shadow-sm">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Unable to load sales returns</p>
              <p className="mt-0.5 break-words text-rose-700/90">{error}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Sales returns</p>
                <p className="text-[11px] text-slate-500">
                  {loading
                    ? 'Loading return records…'
                    : `${filteredReturns.length.toLocaleString('en-IN')} record${
                        filteredReturns.length === 1 ? '' : 's'
                      }`}
                </p>
              </div>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {currentPage} / {totalPages}
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <Table className="min-w-[1080px]">
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                  <TableHead>Return</TableHead>
                  <TableHead>Original invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Refund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-slate-100">
                      {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, c) => (
                        <TableCell key={c}>
                          <div className="h-4 animate-pulse rounded bg-slate-100" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!loading &&
                  paginatedReturns.map((row) => {
                    const itemCount =
                      row.items?.filter((i) => toNumber(i.return_qty) > 0).length || 0;
                    const editable = EDITABLE_STATUSES.includes(row.status);
                    const deletable = DELETABLE_STATUSES.includes(row.status);
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70"
                        onClick={() => { if (!openingReturnId) handleView(row); }}
                      >
                        <TableCell>
                          <div className="min-w-[140px]">
                            <p className="font-mono text-sm font-semibold text-slate-900">
                              {row.return_number || `#${row.id}`}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                              #{row.id}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                            {row.original_invoice_no || '—'}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex min-w-[180px] items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
                              {(row.customer?.name || 'U').charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate text-sm font-medium text-slate-800">
                              {row.customer?.name || `Customer #${row.customer_id}`}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-sm text-slate-600">
                          {row.return_date || '—'}
                        </TableCell>

                        <TableCell className="text-center text-sm tabular-nums text-slate-700">
                          {itemCount}
                        </TableCell>

                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-slate-900">
                          {formatCurrency(row.grand_total)}
                        </TableCell>

                        <TableCell>
                          <RefundStatusBadge status={row.refund_status} />
                        </TableCell>

                        <TableCell>
                          <ReturnStatusBadge status={row.status} />
                        </TableCell>

                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleView(row)}
                              disabled={openingReturnId === row.id}
                              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:cursor-wait disabled:opacity-50"
                              title="View"
                              aria-label={`View ${row.return_number}`}
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEdit(row)}
                              disabled={!editable || openingReturnId === row.id}
                              className="grid h-8 w-8 place-items-center rounded-lg text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title={editable ? 'Edit draft' : 'Only drafts editable'}
                              aria-label={`Edit ${row.return_number}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              disabled={!deletable}
                              className="grid h-8 w-8 place-items-center rounded-lg text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                              title={deletable ? 'Delete draft' : 'Processed returns cannot be deleted'}
                              aria-label={`Delete ${row.return_number}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                {!loading && !paginatedReturns.length && (
                  <TableRow>
                    <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                      <div className="mx-auto max-w-md px-4">
                        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-slate-800">
                          No sales returns found
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Try adjusting the filters, or create your first return.
                        </p>
                        <div className="mt-5 flex items-center justify-center gap-2">
                          {activeFilterCount > 0 && (
                            <Button variant="outline" className="rounded-lg" onClick={clearFilters}>
                              <RefreshCw className="mr-2 h-3.5 w-3.5" /> Reset filters
                            </Button>
                          )}
                          <Button
                            className="rounded-lg bg-indigo-600 hover:bg-indigo-700"
                            onClick={handleCreate}
                          >
                            <Plus className="mr-2 h-3.5 w-3.5" /> New return
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-4 py-3.5 sm:px-5 md:flex-row md:items-center md:justify-between">
            <p className="text-xs text-slate-500 sm:text-[13px]">
              Showing{' '}
              <span className="font-semibold text-slate-700">
                {filteredReturns.length === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1}
              </span>
              –
              <span className="font-semibold text-slate-700">
                {Math.min(currentPage * ROWS_PER_PAGE, filteredReturns.length)}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-slate-700">
                {filteredReturns.length.toLocaleString('en-IN')}
              </span>
            </p>
            <div className="flex items-center justify-between gap-1.5 sm:justify-end">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage(1)}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="mx-1 min-w-[76px] rounded-lg bg-slate-100 px-3 py-1.5 text-center text-xs font-semibold text-slate-700">
                {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage(totalPages)}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {isPanelOpen && (
        <FormPanel
          isOpen={isPanelOpen}
          isReadOnly={isReadOnly}
          viewingId={viewingId}
          editingId={editingId}
          selectedReturn={selectedReturn}
          formData={formData}
          setFormData={setFormData}
          formErrors={formErrors}
          submitting={submitting}
          warehouses={warehouses || []}
          companies={companies || []}
          formBranchOptions={formBranchOptions}
          invoiceSearchQuery={invoiceSearchQuery}
          invoiceSearchResults={invoiceSearchResults}
          showInvoiceDropdown={showInvoiceDropdown}
          invoiceSearchLoading={invoiceSearchLoading}
          totals={totals}
          onClose={closePanel}
          onSubmit={handleSubmit}
          onInvoiceSearchChange={handleInvoiceSearch}
          onLoadInvoice={loadInvoiceDetails}
          onUpdateItem={updateItem}
          onRemoveItem={removeItem}
          onSetFullReturn={setFullReturn}
          onSetPartialReturn={setPartialReturn}
        />
      )}
    </div>
  );
}

export default SalesInvoiceReturnPage;

/* ------------------------------------------------------------------ */
/* Local useApiCache hook                                              */
/* ------------------------------------------------------------------ */

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

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const fetchData = useCallback(
    async (skipCache = false) => {
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
    },
    [cache, key, ttlMs]
  );

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(true), [fetchData]);
  return { data, loading, error, refresh };
}