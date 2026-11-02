import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FiArrowLeft,
  FiPrinter,
  FiShare2,
  FiEdit2,
  FiCopy,
  FiTrash2,
  FiCheckCircle,
  FiXCircle,
  FiSend,
  FiCalendar,
  FiClock,
  FiBriefcase,
  FiMapPin,
  FiPhone,
  FiMail,
  FiCheck,
  FiAlertCircle,
  FiLayers,
  FiExternalLink,
  FiRefreshCw,
  FiUser,
  FiHash,
  FiX,
  FiMoreVertical,
  FiChevronDown,
  FiFileText,
  FiChevronRight,
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useAuthStore } from '../store/auth';

type PrintFormat = 'a4' | '80mm' | '58mm';
type ThermalFormat = '58mm' | '80mm';

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;
  close(): Promise<void>;
}

interface SerialApiLike {
  requestPort(): Promise<SerialPortLike>;
}

interface ReceiptHeaderOptions {
  showCompanyName?: boolean;
  showBranchName?: boolean;
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const SERIAL_OPTIONS = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const,
  flowControl: 'none' as const,
};

const THERMAL_TEXT_WIDTH: Record<ThermalFormat, number> = {
  '58mm': 32,
  '80mm': 48,
};

const getSerialApi = (): SerialApiLike | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { serial?: SerialApiLike };
  return nav.serial ?? null;
};

const cleanText = (value: unknown): string => {
  if (value == null) return '';
  return String(value).trim();
};

const clampText = (value: unknown, maxLength: number): string => {
  const text = cleanText(value);
  if (!text) return '';
  return text.slice(0, Math.max(1, maxLength));
};

const padColumns = (left: string, right: string, width: number): string => {
  const cleanLeft = left || '';
  const cleanRight = right || '';
  const spaces = Math.max(1, width - cleanLeft.length - cleanRight.length);
  return cleanLeft + ' '.repeat(spaces) + cleanRight;
};

const wrapPreviewAddress = (address: string, width: number): string[] => {
  const cleaned = cleanText(address);
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/);
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      if (current) result.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (current) result.push(current);
  return result;
};

const encodePrinterText = (value: string): number[] => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?');
  return Array.from(new TextEncoder().encode(normalized));
};

interface QuotationItem {
  id: number;
  quotation_id: number;
  product_id: number | null;
  item_name: string;
  description: string | null;
  hsn_code: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount_percent: number | string;
  discount_amount: number | string;
  gst_slab: number | string;
  is_inter_state: boolean | number;
  cgst_rate: number | string;
  cgst_amount: number | string;
  sgst_rate: number | string;
  sgst_amount: number | string;
  igst_rate: number | string;
  igst_amount: number | string;
  tax_amount: number | string;
  subtotal: number | string;
  total: number | string;
  product?: {
    id: number;
    name: string;
    sku?: string;
    barcode?: string;
  };
}

interface Quotation {
  id: number;
  quotation_number: string;
  reference_no?: string;
  quotation_date: string;
  valid_until?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  company_id: number;
  branch_id?: number | null;
  customer_id?: number | null;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  billing_address?: string | null;
  shipping_address?: string | null;
  gstin?: string | null;
  pan?: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  taxable_amount: number | string;
  cgst_amount: number | string;
  sgst_amount: number | string;
  igst_amount: number | string;
  tax_amount: number | string;
  shipping_charges: number | string;
  other_charges: number | string;
  round_off: number | string;
  total_amount: number | string;
  notes?: string | null;
  terms_and_conditions?: string | null;
  rejection_reason?: string | null;
  converted_invoice_id?: number | null;
  converted_at?: string | null;
  assigned_to?: number | null;
  created_by?: number | null;
  company?: {
    id: number;
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
    logo_url?: string;
  };
  branch?: {
    id: number;
    name: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
  customer?: {
    id: number;
    name: string;
    email?: string;
    phone?: string;
    company_name?: string;
    gst_number?: string;
    pan_number?: string;
  };
  assignee?: { id: number; name: string; email: string };
  creator?: { id: number; name: string; email?: string };
  converted_invoice?: {
    id: number;
    invoice_no: string;
    total_amount: number | string;
    status: string;
    created_at?: string;
  };
  items: QuotationItem[];
}

const safeNum = (val: unknown): number => {
  const n = typeof val === 'number' ? val : parseFloat(String(val ?? 0));
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (val: unknown): string => {
  return safeNum(val).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatDate = (val?: string | null): string => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return Number.isNaN(d.getTime())
      ? val
      : d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
  } catch {
    return val;
  }
};

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  draft: { label: 'Draft', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-400' },
  sent: { label: 'Sent', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  accepted: { label: 'Accepted', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  expired: { label: 'Expired', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  converted: { label: 'Converted', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
};

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${status === 'sent' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}

function MetaPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="text-slate-400">{icon}</span>
      {label}
    </span>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 w-72 rounded-lg bg-slate-200" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-44 rounded-2xl bg-slate-100" />
        <div className="h-44 rounded-2xl bg-slate-100" />
      </div>
      <div className="space-y-3 rounded-2xl border border-slate-200 p-5">
        <div className="h-6 w-48 rounded bg-slate-200" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuthStore((s) => s.user);

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [activeFormat, setActiveFormat] = useState<PrintFormat>('a4');
  const [previewTab, setPreviewTab] = useState<'standard' | 'a4' | '80mm' | '58mm'>('standard');

  const [showPrintSelector, setShowPrintSelector] = useState(false);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<ThermalFormat>('58mm');
  const [showCompanyName, setShowCompanyName] = useState(true);
  const [showBranchName, setShowBranchName] = useState(true);
  const [isThermalPrinting, setIsThermalPrinting] = useState(false);
  const [serialConnected, setSerialConnected] = useState(false);
  const [serialConnecting, setSerialConnecting] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const printMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }, []);

  const serialPortRef = useRef<SerialPortLike | null>(null);
  const serialOperationRef = useRef<Promise<void> | null>(null);

  /* ------------------ Dropdown outside-click handlers ------------------ */
  useEffect(() => {
    if (!showPrintMenu && !showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showPrintMenu && printMenuRef.current && !printMenuRef.current.contains(target)) {
        setShowPrintMenu(false);
      }
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPrintMenu, showMoreMenu]);

  /* ------------------ Escape key closes any open modal ------------------ */
  useEffect(() => {
    const open = showPrintSelector || showPrintMenu || showMoreMenu;
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPrintSelector(false);
        setShowPrintMenu(false);
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showPrintSelector, showPrintMenu, showMoreMenu]);

  /* ------------------ Text Receipt Generator ------------------ */
  const generateTextReceipt = useCallback(
    (format: ThermalFormat, q: Quotation, options?: ReceiptHeaderOptions): string => {
      const showComp = options?.showCompanyName !== false;
      const showBranch = options?.showBranchName !== false;
      const width = THERMAL_TEXT_WIDTH[format];
      const divider = '-'.repeat(width);
      const doubleDivider = '='.repeat(width);

      const compName = q.company?.name || 'RaptorERP Business';
      const brName = q.branch?.name || '';
      const compAddr = q.company?.address || '';
      const brAddr = q.branch?.address || '';
      const bAddr = brAddr || compAddr;
      const bPhone = q.branch?.phone || q.company?.phone || '';
      const bGstin = q.company?.gstin || '';
      const bPan = q.company?.pan || '';

      const cName = q.customer_name || 'Valued Customer';
      const cPhone = q.customer_phone || '';
      const cAddr = q.shipping_address || q.billing_address || '';
      const cGstin = q.gstin || '';

      const lines: string[] = [];

      if (showComp) lines.push(clampText(compName, width));
      if (showBranch && brName) lines.push(clampText(`Branch: ${brName}`, width));
      if (bAddr) lines.push(...wrapPreviewAddress(bAddr, width));
      if (bPhone) lines.push(clampText(`Phone: ${bPhone}`, width));
      if (bGstin) lines.push(clampText(`GSTIN: ${bGstin}`, width));
      else if (bPan) lines.push(clampText(`PAN: ${bPan}`, width));

      lines.push(divider);

      const title = '*** QUOTATION / ESTIMATE ***';
      const centerPad = Math.max(0, Math.floor((width - title.length) / 2));
      lines.push(' '.repeat(centerPad) + title);
      lines.push(divider);

      lines.push(clampText(`Quote #: ${q.quotation_number}`, width));
      lines.push(clampText(`Date: ${formatDate(q.quotation_date)}`, width));
      if (q.valid_until) lines.push(clampText(`Valid Until: ${formatDate(q.valid_until)}`, width));
      lines.push(clampText(`Status: ${(q.status || 'draft').toUpperCase()}`, width));

      lines.push(divider);

      lines.push('CUSTOMER:');
      lines.push(clampText(`Name: ${cName}`, width));
      if (cPhone) lines.push(clampText(`Phone: ${cPhone}`, width));
      if (cAddr) lines.push(...wrapPreviewAddress(`Addr: ${cAddr}`, width));
      if (cGstin) lines.push(clampText(`GSTIN: ${cGstin}`, width));

      lines.push(divider);

      lines.push(padColumns('ITEM DESCRIPTION', 'TOTAL', width));
      lines.push(divider);

      for (const item of q.items || []) {
        const itemName = cleanText(item.item_name || item.product?.name) || 'Item';
        wrapPreviewAddress(itemName, width).forEach((nl) => lines.push(nl));

        const qty = Number(item.quantity || 0);
        const rate = Number(item.unit_price || 0);
        const total = Number(item.total || 0);
        const slab = Number(item.gst_slab || 0);
        const disc = Number(item.discount_percent || 0);

        let details = `${qty} x Rs ${rate.toFixed(2)}`;
        if (disc > 0) details += ` (-${disc}%)`;
        if (slab > 0) details += ` [${slab}%]`;

        lines.push(padColumns(`  ${details}`, `Rs ${total.toFixed(2)}`, width));
      }

      lines.push(divider);

      const subtotal = Number(q.subtotal || 0);
      const discount = Number(q.discount_amount || 0);
      const tax = Number(q.tax_amount || 0);
      const shipping = Number(q.shipping_charges || 0);
      const other = Number(q.other_charges || 0);
      const grandTotal = Number(q.total_amount || 0);

      lines.push(padColumns('SUBTOTAL', `Rs ${subtotal.toFixed(2)}`, width));
      if (discount > 0) lines.push(padColumns('DISCOUNT', `-Rs ${discount.toFixed(2)}`, width));
      if (tax > 0) lines.push(padColumns('GST / TAX', `Rs ${tax.toFixed(2)}`, width));
      if (shipping > 0) lines.push(padColumns('SHIPPING', `Rs ${shipping.toFixed(2)}`, width));
      if (other > 0) lines.push(padColumns('OTHER CHARGES', `Rs ${other.toFixed(2)}`, width));

      lines.push(doubleDivider);
      lines.push(padColumns('GRAND TOTAL', `Rs ${grandTotal.toFixed(2)}`, width));
      lines.push(doubleDivider);

      if (q.notes) {
        lines.push('NOTES:');
        lines.push(...wrapPreviewAddress(q.notes, width));
        lines.push(divider);
      }
      if (q.terms_and_conditions) {
        lines.push('TERMS & CONDITIONS:');
        lines.push(...wrapPreviewAddress(q.terms_and_conditions, width));
        lines.push(divider);
      }

      const f1 = '* THANK YOU FOR YOUR BUSINESS *';
      const f2 = 'This is a computer generated quote';
      const f3 = 'Powered by RaptorERP';
      lines.push(' '.repeat(Math.max(0, Math.floor((width - f1.length) / 2))) + f1);
      lines.push(' '.repeat(Math.max(0, Math.floor((width - f2.length) / 2))) + f2);
      lines.push(' '.repeat(Math.max(0, Math.floor((width - f3.length) / 2))) + f3);
      lines.push('');

      return lines.join('\n');
    },
    [],
  );

  const buildEscPosPayload = useCallback(
    (format: ThermalFormat, q: Quotation, options?: ReceiptHeaderOptions): Uint8Array => {
      const output: number[] = [];
      const raw = (bytes: number[]) => output.push(...bytes);
      const text = (str: string) => {
        output.push(...encodePrinterText(str));
        output.push(LF);
      };

      raw([ESC, 0x40]);
      raw([ESC, 0x33, 0x10]);

      const receiptText = generateTextReceipt(format, q, options);
      for (const line of receiptText.split('\n')) text(line);

      raw([LF, LF, LF]);
      raw([GS, 0x56, 0x42, 0x00]);

      return new Uint8Array(output);
    },
    [generateTextReceipt],
  );

  const closeSerialPort = useCallback(async (port: SerialPortLike | null) => {
    if (!port) return;
    try {
      if (port.readable) {
        try {
          await port.readable.cancel();
        } catch {}
      }
    } catch {}
    try {
      await port.close();
    } catch {}
  }, []);

  const withSerialLock = useCallback(async (operation: () => Promise<void>) => {
    while (serialOperationRef.current) {
      try {
        await serialOperationRef.current;
      } catch {}
    }
    const op = operation();
    serialOperationRef.current = op;
    try {
      await op;
    } finally {
      if (serialOperationRef.current === op) serialOperationRef.current = null;
    }
  }, []);

  const connectPrinter = useCallback(async (): Promise<SerialPortLike | null> => {
    if (isMobile) {
      showNotification('error', 'Web Serial is not available on mobile devices. Use RawBT print mode.');
      return null;
    }
    const serial = getSerialApi();
    if (!serial) {
      showNotification('error', 'Web Serial is not supported in this browser. Please use Google Chrome or Microsoft Edge on Windows.');
      return null;
    }
    if (serialConnecting) return serialPortRef.current;
    setSerialConnecting(true);

    try {
      const selectedPort = await serial.requestPort();
      if (serialPortRef.current && serialPortRef.current !== selectedPort) {
        await closeSerialPort(serialPortRef.current);
      }
      await selectedPort.open(SERIAL_OPTIONS);
      serialPortRef.current = selectedPort;
      setSerialConnected(true);
      showNotification('success', 'Thermal printer connected successfully!');
      return selectedPort;
    } catch (err: any) {
      showNotification('error', `Failed to connect thermal printer: ${err.message || 'Port not opened'}`);
      return null;
    } finally {
      setSerialConnecting(false);
    }
  }, [isMobile, serialConnecting, closeSerialPort]);

  const getConnectedPrinter = useCallback(async (): Promise<SerialPortLike | null> => {
    if (isMobile) return null;
    const current = serialPortRef.current;
    if (!current) return connectPrinter();
    try {
      if (current.writable) {
        setSerialConnected(true);
        return current;
      }
      await current.open(SERIAL_OPTIONS);
      setSerialConnected(true);
      return current;
    } catch {
      return connectPrinter();
    }
  }, [isMobile, connectPrinter]);

  const printThermal = useCallback(
    async (format: ThermalFormat) => {
      if (!quotation || isThermalPrinting) return;
      setIsThermalPrinting(true);

      try {
        const receipt = generateTextReceipt(format, quotation, { showCompanyName, showBranchName });

        if (isMobile) {
          window.location.href = `rawbt:text=${encodeURIComponent(receipt)}`;
          showNotification('success', `${format} print request dispatched to RawBT.`);
          return;
        }

        await withSerialLock(async () => {
          let port = await getConnectedPrinter();
          if (!port?.writable) port = await connectPrinter();

          if (!port?.writable) {
            setActiveFormat(format);
            setTimeout(() => window.print(), 100);
            return;
          }

          const payload = buildEscPosPayload(format, quotation, { showCompanyName, showBranchName });
          const writer = port.writable.getWriter();
          try {
            await writer.write(payload);
            showNotification('success', `${format} thermal receipt printed successfully!`);
          } finally {
            writer.releaseLock();
          }
        });
      } catch (err: any) {
        console.warn('Thermal print via Web Serial failed, falling back to browser print:', err);
        showNotification('error', `Hardware printer: ${err.message || 'Error'}. Triggering browser print fallback.`);
        setActiveFormat(format);
        setTimeout(() => window.print(), 150);
      } finally {
        setIsThermalPrinting(false);
      }
    },
    [
      quotation,
      isThermalPrinting,
      isMobile,
      showCompanyName,
      showBranchName,
      generateTextReceipt,
      buildEscPosPayload,
      withSerialLock,
      getConnectedPrinter,
      connectPrinter,
    ],
  );

  /* ------------------ Modals ------------------ */
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [convertForm, setConvertForm] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${day}`;
    const d15 = new Date();
    d15.setDate(d15.getDate() + 15);
    const due = `${d15.getFullYear()}-${String(d15.getMonth() + 1).padStart(2, '0')}-${String(d15.getDate()).padStart(2, '0')}`;
    return {
      invoice_date: today,
      due_date: due,
      auto_deduct_stock: true,
      warehouse_id: '',
      payment_term: 'Net 15',
    };
  });
  const [converting, setConverting] = useState(false);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: 'sent', rejection_reason: '' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadQuotation = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await apiClient.getQuotation(Number(id));
      const data = res?.data || res;
      setQuotation(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load quotation.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadQuotation();
  }, [loadQuotation]);

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        const res: any = await apiClient.getWarehouses();
        const list = Array.isArray(res) ? res : res?.data || [];
        setWarehouses(list);
        if (list.length > 0) setConvertForm((prev) => ({ ...prev, warehouse_id: String(list[0].id) }));
      } catch (e) {
        console.warn('Could not load warehouses', e);
      }
    };
    void loadWarehouses();
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setActionFeedback({ type, message });
    setTimeout(() => setActionFeedback(null), 5000);
  };

  const handlePrint = (format: PrintFormat) => {
    setActiveFormat(format);
    setTimeout(() => window.print(), 150);
  };

  const handleWhatsAppShare = () => {
    if (!quotation) return;
    const phone = quotation.customer_phone?.replace(/\D/g, '') || '';
    const itemsSummary = (quotation.items || [])
      .map((it, idx) => `${idx + 1}. ${it.item_name} x ${it.quantity} = ${formatCurrency(it.total)}`)
      .join('\n');

    const message =
      `*Quotation #${quotation.quotation_number}*\n` +
      `Date: ${formatDate(quotation.quotation_date)}\n` +
      `Valid Until: ${formatDate(quotation.valid_until)}\n` +
      `Dear ${quotation.customer_name},\n\n` +
      `Thank you for your interest. Here is your quotation breakdown:\n` +
      `${itemsSummary}\n\n` +
      `*Grand Total: ${formatCurrency(quotation.total_amount)}*\n\n` +
      `For any questions, please reply to this message.`;

    const encoded = encodeURIComponent(message);
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  const handleDuplicate = async () => {
    if (!quotation) return;
    setShowMoreMenu(false);
    if (!window.confirm(`Create a duplicate copy of Quotation #${quotation.quotation_number}?`)) return;
    try {
      const res: any = await apiClient.duplicateQuotation(quotation.id);
      const newQuote = res?.data || res;
      showNotification('success', `Quotation duplicated as #${newQuote.quotation_number}`);
      if (newQuote.id) navigate(`/quotations/${newQuote.id}`);
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to duplicate quotation.');
    }
  };

  const handleDelete = async () => {
    if (!quotation) return;
    setShowMoreMenu(false);
    if (!window.confirm(`Are you sure you want to delete Quotation #${quotation.quotation_number}? This cannot be undone.`)) return;
    try {
      await apiClient.deleteQuotation(quotation.id);
      showNotification('success', 'Quotation deleted successfully.');
      navigate('/quotations');
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to delete quotation.');
    }
  };

  const handleUpdateStatus = async (status: string, reason?: string) => {
    if (!quotation) return;
    setUpdatingStatus(true);
    try {
      await apiClient.updateQuotationStatus(quotation.id, { status, rejection_reason: reason || undefined });
      showNotification('success', `Quotation status updated to ${status}.`);
      setShowStatusModal(false);
      await loadQuotation();
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quotation) return;
    setConverting(true);
    try {
      const res: any = await apiClient.convertQuotation(quotation.id, {
        invoice_date: convertForm.invoice_date,
        due_date: convertForm.due_date,
        auto_deduct_stock: convertForm.auto_deduct_stock,
        warehouse_id: convertForm.warehouse_id ? Number(convertForm.warehouse_id) : undefined,
        payment_term: convertForm.payment_term,
      });
      const invoice = res?.invoice || res?.data?.invoice || res?.data;
      showNotification('success', `Successfully converted to Invoice #${invoice?.invoice_no || ''}!`);
      setShowConvertModal(false);
      await loadQuotation();
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to convert quotation.');
    } finally {
      setConverting(false);
    }
  };

  const isExpired = useMemo(() => {
    if (!quotation?.valid_until) return false;
    return (
      new Date(quotation.valid_until) < new Date() &&
      quotation.status !== 'converted' &&
      quotation.status !== 'accepted'
    );
  }, [quotation]);

  if (loading) return <LoadingSkeleton />;

  if (error || !quotation) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-rose-800">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <FiAlertCircle className="text-xl" />
            </div>
            <div>
              <h3 className="font-semibold text-rose-900">Unable to display quotation</h3>
              <p className="mt-1 text-sm text-rose-700">{error || 'Quotation not found.'}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2 pl-13">
            <button
              onClick={() => void loadQuotation()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              <FiRefreshCw size={14} /> Try Again
            </button>
            <Link
              to="/quotations"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              <FiArrowLeft size={14} /> Back to Quotations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isConverted = quotation.status === 'converted' && !!quotation.converted_invoice;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      {/* ---------------- Toast Notification ---------------- */}
      {actionFeedback && (
        <div
          className={`fixed right-4 top-4 z-[60] flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg animate-slide-in-right ${
            actionFeedback.type === 'success'
              ? 'border-emerald-200 bg-white text-emerald-800'
              : 'border-rose-200 bg-white text-rose-800'
          }`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
              actionFeedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
            }`}
          >
            {actionFeedback.type === 'success' ? <FiCheck size={12} /> : <FiAlertCircle size={12} />}
          </span>
          <span className="flex-1">{actionFeedback.message}</span>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 transition hover:text-slate-600"
            aria-label="Dismiss"
          >
            <FiX size={14} />
          </button>
        </div>
      )}

      {/* ---------------- Header / action bar ---------------- */}
      <div className="no-print space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          {/* Left: title & meta */}
          <div className="flex min-w-0 items-start gap-3">
            <Link
              to="/quotations"
              className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              title="Back to Quotations"
            >
              <FiArrowLeft size={16} />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">
                  Quotation #{quotation.quotation_number}
                </h1>
                <StatusBadge status={quotation.status} />
                {isExpired && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                    <FiClock size={10} /> Expired
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <MetaPill icon={<FiCalendar size={11} />} label={formatDate(quotation.quotation_date)} />
                {quotation.valid_until && (
                  <MetaPill icon={<FiClock size={11} />} label={`Valid until ${formatDate(quotation.valid_until)}`} />
                )}
                {quotation.branch?.name && <MetaPill icon={<FiBriefcase size={11} />} label={quotation.branch.name} />}
                {quotation.assignee?.name && <MetaPill icon={<FiUser size={11} />} label={quotation.assignee.name} />}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {/* Workflow status actions */}
            {quotation.status === 'draft' && (
              <button
                type="button"
                onClick={() => void handleUpdateStatus('sent')}
                disabled={updatingStatus}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
              >
                <FiSend size={13} /> Mark Sent
              </button>
            )}
            {quotation.status === 'sent' && (
              <>
                <button
                  type="button"
                  onClick={() => void handleUpdateStatus('accepted')}
                  disabled={updatingStatus}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  <FiCheckCircle size={13} /> Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusForm({ status: 'rejected', rejection_reason: '' });
                    setShowStatusModal(true);
                  }}
                  disabled={updatingStatus}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                >
                  <FiXCircle size={13} /> Reject
                </button>
              </>
            )}

            {/* Print dropdown */}
            <div className="relative" ref={printMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowPrintMenu((v) => !v);
                  setShowMoreMenu(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                <FiPrinter size={13} className="text-emerald-600" /> Print
                <FiChevronDown size={12} className={`transition-transform ${showPrintMenu ? 'rotate-180' : ''}`} />
              </button>
              {showPrintMenu && (
                <div className="absolute right-0 z-40 mt-1.5 w-56 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-fade-in">
                  <DropdownItem
                    icon={<FiFileText size={14} />}
                    label="A4 Proposal"
                    hint="Full-page PDF / print"
                    onClick={() => {
                      setShowPrintMenu(false);
                      handlePrint('a4');
                    }}
                  />
                  <DropdownItem
                    icon={<FiPrinter size={14} />}
                    label="80mm Thermal"
                    hint="3-inch POS receipt"
                    onClick={() => {
                      setShowPrintMenu(false);
                      void printThermal('80mm');
                    }}
                    disabled={isThermalPrinting}
                  />
                  <DropdownItem
                    icon={<FiPrinter size={14} />}
                    label="58mm Thermal"
                    hint="2-inch POS receipt"
                    onClick={() => {
                      setShowPrintMenu(false);
                      void printThermal('58mm');
                    }}
                    disabled={isThermalPrinting}
                  />
                  <div className="my-1 h-px bg-slate-100" />
                  <DropdownItem
                    icon={<FiPrinter size={14} />}
                    label="Print & Thermal Center"
                    hint="Hardware setup & preview"
                    onClick={() => {
                      setShowPrintMenu(false);
                      setShowPrintSelector(true);
                    }}
                  />
                </div>
              )}
            </div>

            {/* Share */}
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
              title="Share via WhatsApp"
            >
              <FiShare2 size={13} /> Share
            </button>

            {/* Convert / View invoice */}
            {!isConverted ? (
              <button
                type="button"
                onClick={() => setShowConvertModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700"
              >
                <FiLayers size={13} /> Convert to Invoice
              </button>
            ) : (
              <Link
                to={`/invoices/${quotation.converted_invoice!.id}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
              >
                <FiExternalLink size={13} /> Invoice #{quotation.converted_invoice!.invoice_no}
              </Link>
            )}

            {/* More menu */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowMoreMenu((v) => !v);
                  setShowPrintMenu(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
                aria-label="More actions"
              >
                <FiMoreVertical size={16} />
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 z-40 mt-1.5 w-48 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl animate-fade-in">
                  {!isConverted && (
                    <DropdownItem
                      icon={<FiEdit2 size={14} />}
                      label="Edit"
                      onClick={() => {
                        setShowMoreMenu(false);
                        navigate(`/quotations/${quotation.id}/edit`);
                      }}
                    />
                  )}
                  <DropdownItem
                    icon={<FiCopy size={14} />}
                    label="Duplicate"
                    onClick={() => void handleDuplicate()}
                  />
                  {!isConverted && (
                    <>
                      <div className="my-1 h-px bg-slate-100" />
                      <DropdownItem
                        icon={<FiTrash2 size={14} />}
                        label="Delete"
                        destructive
                        onClick={() => void handleDelete()}
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Converted notice */}
        {isConverted && quotation.converted_invoice && (
          <div className="flex flex-col gap-3 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <FiCheckCircle size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-900">
                  Converted to Sales Invoice #{quotation.converted_invoice.invoice_no}
                </p>
                <p className="mt-0.5 text-xs text-purple-700">
                  Total: {formatCurrency(quotation.converted_invoice.total_amount)} · Status:{' '}
                  {quotation.converted_invoice.status}
                  {quotation.converted_at ? ` · Converted on ${formatDate(quotation.converted_at)}` : ''}
                </p>
              </div>
            </div>
            <Link
              to={`/invoices/${quotation.converted_invoice.id}`}
              className="inline-flex items-center gap-1.5 self-start rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 sm:self-auto"
            >
              Open Invoice <FiChevronRight size={13} />
            </Link>
          </div>
        )}

        {/* Rejection banner */}
        {quotation.status === 'rejected' && quotation.rejection_reason && (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <FiAlertCircle size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-900">Rejection Reason</p>
              <p className="mt-0.5 text-xs text-rose-800">{quotation.rejection_reason}</p>
            </div>
          </div>
        )}

        {/* View mode tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200">
          {[
            { key: 'standard', label: 'Overview' },
            { key: 'a4', label: 'A4 Preview' },
            { key: '80mm', label: '80mm Thermal' },
            { key: '58mm', label: '58mm Thermal' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setPreviewTab(tab.key as any);
                if (tab.key !== 'standard') setActiveFormat(tab.key as PrintFormat);
              }}
              className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                previewTab === tab.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- Standard view ---------------- */}
      {previewTab === 'standard' && (
        <div className="no-print space-y-5">
          {/* Info cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard
              title="Issuer / Branch"
              icon={<FiBriefcase size={14} />}
              accent="emerald"
              badge={quotation.branch?.name}
            >
              <div className="text-base font-bold text-slate-900">
                {quotation.company?.name || 'Your Company'}
              </div>
              {(quotation.branch?.address || quotation.company?.address) && (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {quotation.branch?.address || quotation.company?.address}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {quotation.company?.gstin && <span><span className="text-slate-400">GSTIN</span> {quotation.company.gstin}</span>}
                {quotation.company?.pan && <span><span className="text-slate-400">PAN</span> {quotation.company.pan}</span>}
                {(quotation.branch?.phone || quotation.company?.phone) && (
                  <span className="inline-flex items-center gap-1">
                    <FiPhone size={11} className="text-slate-400" />
                    {quotation.branch?.phone || quotation.company?.phone}
                  </span>
                )}
                {(quotation.branch?.email || quotation.company?.email) && (
                  <span className="inline-flex items-center gap-1">
                    <FiMail size={11} className="text-slate-400" />
                    {quotation.branch?.email || quotation.company?.email}
                  </span>
                )}
              </div>
            </InfoCard>

            <InfoCard
              title="Prepared For"
              icon={<FiUser size={14} />}
              accent="blue"
              action={
                quotation.customer_id ? (
                  <Link
                    to={`/customers/${quotation.customer_id}`}
                    className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    View Card <FiChevronRight size={11} />
                  </Link>
                ) : undefined
              }
            >
              <div className="text-base font-bold text-slate-900">{quotation.customer_name}</div>
              {quotation.billing_address && (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  <span className="text-slate-400">Billing: </span>
                  {quotation.billing_address}
                </p>
              )}
              {quotation.shipping_address && quotation.shipping_address !== quotation.billing_address && (
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                  <span className="text-slate-400">Shipping: </span>
                  {quotation.shipping_address}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {quotation.gstin && <span><span className="text-slate-400">GSTIN</span> {quotation.gstin}</span>}
                {quotation.pan && <span><span className="text-slate-400">PAN</span> {quotation.pan}</span>}
                {quotation.customer_phone && (
                  <span className="inline-flex items-center gap-1">
                    <FiPhone size={11} className="text-slate-400" />
                    {quotation.customer_phone}
                  </span>
                )}
                {quotation.customer_email && (
                  <span className="inline-flex items-center gap-1">
                    <FiMail size={11} className="text-slate-400" />
                    {quotation.customer_email}
                  </span>
                )}
              </div>
            </InfoCard>
          </div>

          {/* Items table */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FiFileText size={15} className="text-slate-500" />
                Items & Breakdown
              </div>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                {(quotation.items || []).length} items
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-white text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-3 text-center font-semibold w-10">#</th>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-3 py-3 text-center font-semibold">HSN</th>
                    <th className="px-3 py-3 text-right font-semibold">Qty</th>
                    <th className="px-3 py-3 text-right font-semibold">Rate</th>
                    <th className="px-3 py-3 text-right font-semibold">Disc</th>
                    <th className="px-3 py-3 text-right font-semibold">GST</th>
                    <th className="px-3 py-3 text-right font-semibold">Tax</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(quotation.items || []).map((item, index) => (
                    <tr key={item.id || index} className="transition-colors hover:bg-slate-50/60">
                      <td className="px-3 py-3 text-center font-medium text-slate-400">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{item.item_name}</div>
                        {item.description && (
                          <div className="mt-0.5 text-[11px] text-slate-500">{item.description}</div>
                        )}
                        {item.product?.sku && (
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">SKU: {item.product.sku}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600">{item.hsn_code || '—'}</td>
                      <td className="px-3 py-3 text-right font-medium text-slate-700">{item.quantity}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatCurrency(item.unit_price)}</td>
                      <td className="px-3 py-3 text-right text-amber-600">
                        {safeNum(item.discount_amount) > 0 ? (
                          <>
                            {formatCurrency(item.discount_amount)}
                            {safeNum(item.discount_percent) > 0 && (
                              <span className="block text-[10px] text-slate-400">({item.discount_percent}%)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">
                        {item.gst_slab}%
                        <span className="block text-[10px] text-slate-400">
                          {item.is_inter_state ? 'IGST' : 'CGST+SGST'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-slate-700">
                        {formatCurrency(item.tax_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                  {(!quotation.items || quotation.items.length === 0) && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400">
                        No items in this quotation.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="border-t border-slate-100 bg-slate-50/50 p-5">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-3 text-xs">
                  {quotation.notes && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Notes
                      </div>
                      <p className="whitespace-pre-line leading-relaxed text-slate-600">{quotation.notes}</p>
                    </div>
                  )}
                  {quotation.terms_and_conditions && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Terms & Conditions
                      </div>
                      <p className="whitespace-pre-line leading-relaxed text-slate-600">
                        {quotation.terms_and_conditions}
                      </p>
                    </div>
                  )}
                  {!quotation.notes && !quotation.terms_and_conditions && (
                    <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/50 py-8 text-[11px] text-slate-400">
                      No additional notes or terms provided
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
                  <SummaryRow label="Items Subtotal" value={formatCurrency(quotation.subtotal)} />
                  {safeNum(quotation.discount_amount) > 0 && (
                    <SummaryRow
                      label="Discount"
                      value={`- ${formatCurrency(quotation.discount_amount)}`}
                      tone="amber"
                    />
                  )}
                  <div className="my-2 h-px bg-slate-100" />
                  <SummaryRow
                    label="Taxable Amount"
                    value={formatCurrency(quotation.taxable_amount)}
                    bold
                  />
                  {safeNum(quotation.cgst_amount) > 0 && (
                    <SummaryRow label="CGST" value={formatCurrency(quotation.cgst_amount)} muted />
                  )}
                  {safeNum(quotation.sgst_amount) > 0 && (
                    <SummaryRow label="SGST" value={formatCurrency(quotation.sgst_amount)} muted />
                  )}
                  {safeNum(quotation.igst_amount) > 0 && (
                    <SummaryRow label="IGST" value={formatCurrency(quotation.igst_amount)} muted />
                  )}
                  {safeNum(quotation.shipping_charges) > 0 && (
                    <SummaryRow label="Shipping" value={formatCurrency(quotation.shipping_charges)} muted />
                  )}
                  {safeNum(quotation.other_charges) > 0 && (
                    <SummaryRow label="Other Charges" value={formatCurrency(quotation.other_charges)} muted />
                  )}
                  {safeNum(quotation.round_off) !== 0 && (
                    <SummaryRow label="Round Off" value={formatCurrency(quotation.round_off)} muted />
                  )}
                  <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
                    <span className="text-sm font-bold text-slate-900">Grand Total</span>
                    <span className="text-base font-bold text-emerald-700">
                      {formatCurrency(quotation.total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- A4 preview ---------------- */}
      {previewTab === 'a4' && (
        <div className="no-print space-y-3">
          <PreviewBar label="Standard A4 Proposal" onPrint={() => handlePrint('a4')} printLabel="Print A4" />
          <div className="mx-auto max-w-4xl rounded-2xl border border-slate-300 bg-white p-6 shadow-md md:p-8">
            <QuotationA4Layout quotation={quotation} />
          </div>
        </div>
      )}

      {/* ---------------- 80mm preview ---------------- */}
      {previewTab === '80mm' && (
        <div className="no-print space-y-3">
          <PreviewBar
            label="Thermal 80mm (3-inch POS Receipt)"
            onPrint={() => handlePrint('80mm')}
            printLabel="Print 80mm"
          />
          <div className="flex justify-center rounded-2xl bg-slate-100 p-4">
            <div className="rounded-md border border-slate-300 bg-white p-4 shadow-lg">
              <QuotationThermalLayout quotation={quotation} widthMm={80} />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 58mm preview ---------------- */}
      {previewTab === '58mm' && (
        <div className="no-print space-y-3">
          <PreviewBar
            label="Thermal 58mm (2-inch POS Receipt)"
            onPrint={() => handlePrint('58mm')}
            printLabel="Print 58mm"
          />
          <div className="flex justify-center rounded-2xl bg-slate-100 p-4">
            <div className="rounded-md border border-slate-300 bg-white p-4 shadow-lg">
              <QuotationThermalLayout quotation={quotation} widthMm={58} />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Dedicated print mount ---------------- */}
      <div id="print-mount-area" className="hidden">
        {activeFormat === 'a4' && <QuotationA4Layout quotation={quotation} />}
        {activeFormat === '80mm' && <QuotationThermalLayout quotation={quotation} widthMm={80} />}
        {activeFormat === '58mm' && <QuotationThermalLayout quotation={quotation} widthMm={58} />}
      </div>

      {/* ---------------- Convert to Invoice modal ---------------- */}
      {showConvertModal && (
        <Modal onClose={() => setShowConvertModal(false)}>
          <ModalHeader
            icon={<FiLayers size={18} />}
            title="Convert to Sales Invoice"
            subtitle={`Quotation #${quotation.quotation_number} · ${quotation.customer_name}`}
            onClose={() => setShowConvertModal(false)}
          />
          <form onSubmit={handleConvert} className="space-y-4 p-6">
            <div className="rounded-xl border border-purple-100 bg-purple-50/70 p-3 text-xs text-purple-800">
              This will create an official Sales Invoice for{' '}
              <strong>{formatCurrency(quotation.total_amount)}</strong>, link it to this quotation, and update its
              status to Converted.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Invoice Date *">
                <input
                  type="date"
                  required
                  value={convertForm.invoice_date}
                  onChange={(e) => setConvertForm({ ...convertForm, invoice_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                />
              </FormField>
              <FormField label="Due Date *">
                <input
                  type="date"
                  required
                  value={convertForm.due_date}
                  onChange={(e) => setConvertForm({ ...convertForm, due_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Dispatch Warehouse">
                <select
                  value={convertForm.warehouse_id}
                  onChange={(e) => setConvertForm({ ...convertForm, warehouse_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                >
                  <option value="">Default Warehouse</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.code ? `(${w.code})` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Payment Term">
                <select
                  value={convertForm.payment_term}
                  onChange={(e) => setConvertForm({ ...convertForm, payment_term: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
                >
                  <option value="Immediate">Immediate / Due on Receipt</option>
                  <option value="Net 7">Net 7 Days</option>
                  <option value="Net 15">Net 15 Days</option>
                  <option value="Net 30">Net 30 Days</option>
                  <option value="Net 60">Net 60 Days</option>
                </select>
              </FormField>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <input
                type="checkbox"
                checked={convertForm.auto_deduct_stock}
                onChange={(e) => setConvertForm({ ...convertForm, auto_deduct_stock: e.target.checked })}
                className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-xs text-slate-700">
                Automatically deduct warehouse stock and record inventory movement
              </span>
            </label>

            <ModalFooter
              onCancel={() => setShowConvertModal(false)}
              submitLabel={converting ? 'Creating Invoice…' : 'Generate Sales Invoice'}
              submitting={converting}
              variant="purple"
            />
          </form>
        </Modal>
      )}

      {/* ---------------- Reject status modal ---------------- */}
      {showStatusModal && (
        <Modal onClose={() => setShowStatusModal(false)} size="sm">
          <ModalHeader
            icon={<FiXCircle size={18} />}
            title="Record Rejection"
            subtitle="Please specify the reason for rejecting this quotation."
            onClose={() => setShowStatusModal(false)}
            tone="rose"
          />
          <div className="space-y-3 p-6">
            <FormField label="Rejection Reason">
              <textarea
                rows={3}
                value={statusForm.rejection_reason}
                onChange={(e) => setStatusForm({ ...statusForm, rejection_reason: e.target.value })}
                placeholder="e.g. Budget constraints, competitor offered lower pricing, postponed project…"
                className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-100"
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3.5">
            <button
              type="button"
              onClick={() => setShowStatusModal(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={updatingStatus}
              onClick={() => void handleUpdateStatus('rejected', statusForm.rejection_reason)}
              className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
            >
              {updatingStatus ? 'Updating…' : 'Confirm Rejection'}
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------- Print & Thermal Center modal ---------------- */}
      {showPrintSelector && quotation && (
        <Modal onClose={() => setShowPrintSelector(false)} size="lg">
          <ModalHeader
            icon={<FiPrinter size={18} />}
            title="Print & Thermal Center"
            subtitle={`#${quotation.quotation_number} · Choose a format or connect a hardware printer`}
            onClose={() => setShowPrintSelector(false)}
          />

          <div className="max-h-[70vh] space-y-5 overflow-y-auto p-6">
            {/* Printer status */}
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">ESC/POS Thermal Hardware</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isMobile
                    ? 'Mobile Device · Android RawBT Protocol'
                    : serialConnected
                      ? 'Connected · Web Serial · 9600 Baud'
                      : 'Not connected · Web Serial (USB/COM)'}
                </p>
              </div>
              {!isMobile && (
                <button
                  type="button"
                  onClick={() => void connectPrinter()}
                  disabled={serialConnecting || isThermalPrinting}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 ${
                    serialConnected ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  <FiPrinter size={13} />
                  {serialConnecting
                    ? 'Connecting…'
                    : serialConnected
                      ? 'Reconnect Printer'
                      : 'Connect Thermal Printer'}
                </button>
              )}
            </div>

            {/* Header toggles */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Receipt Header Options
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ToggleChip
                  icon={<FiBriefcase size={13} />}
                  label="Company name"
                  active={showCompanyName}
                  onToggle={() => setShowCompanyName((v) => !v)}
                />
                <ToggleChip
                  icon={<FiHash size={13} />}
                  label="Branch name"
                  active={showBranchName}
                  onToggle={() => setShowBranchName((v) => !v)}
                />
              </div>
            </div>

            {/* Format cards */}
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Print Format</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormatCard
                  title="A4 Standard"
                  subtitle="Full proposal · PDF"
                  tone="slate"
                  onClick={() => {
                    setShowPrintSelector(false);
                    handlePrint('a4');
                  }}
                />
                <FormatCard
                  title='58mm Thermal (2")'
                  subtitle="Compact · 32 cols"
                  tone="emerald"
                  disabled={isThermalPrinting}
                  onClick={() => void printThermal('58mm')}
                />
                <FormatCard
                  title='80mm Thermal (3")'
                  subtitle="Standard · 48 cols"
                  tone="blue"
                  disabled={isThermalPrinting}
                  onClick={() => void printThermal('80mm')}
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Live Preview</span>
                  <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                    {(['58mm', '80mm'] as ThermalFormat[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setPreviewFormat(f)}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                          previewFormat === f
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const textReceipt = generateTextReceipt(previewFormat, quotation, {
                      showCompanyName,
                      showBranchName,
                    });
                    navigator.clipboard.writeText(textReceipt);
                    setCopiedReceipt(true);
                    setTimeout(() => setCopiedReceipt(false), 2000);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                >
                  <FiCopy size={12} />
                  {copiedReceipt ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="max-h-72 select-all overflow-auto whitespace-pre-wrap bg-slate-900 p-4 font-mono text-[11px] leading-[1.35] text-emerald-400">
                {generateTextReceipt(previewFormat, quotation, { showCompanyName, showBranchName })}
              </pre>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 text-xs leading-relaxed text-indigo-900">
              <strong>How printing works:</strong> On desktop Chrome/Edge, receipts are transmitted directly to USB/COM
              ESC/POS thermal printers via Web Serial. On mobile Android, print requests dispatch to the RawBT thermal
              service.
            </div>
          </div>

          <div className="flex flex-col-reverse items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3.5 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setShowPrintSelector(false);
                handlePrint(previewFormat === '58mm' ? '58mm' : '80mm');
              }}
              className="text-xs font-medium text-slate-500 underline transition hover:text-slate-900"
            >
              Use browser print instead
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPrintSelector(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void printThermal(previewFormat)}
                disabled={isThermalPrinting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                <FiPrinter size={13} />
                {isThermalPrinting ? 'Printing…' : `Print ${previewFormat}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ---------------- Print media styles + animations ---------------- */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-slide-in-right { animation: slideInRight 0.22s ease-out; }
        .animate-fade-in         { animation: fadeIn 0.16s ease-out; }
        .animate-modal-in        { animation: modalIn 0.2s ease-out; }

        @media print {
          @page {
            margin: ${activeFormat === 'a4' ? '10mm' : '0'};
            size: ${activeFormat === 'a4' ? 'A4 portrait' : activeFormat === '80mm' ? '80mm auto' : '58mm auto'};
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
          }
          body * { visibility: hidden !important; }
          #print-mount-area, #print-mount-area * { visibility: visible !important; }
          #print-mount-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #fff !important;
            margin: 0 !important;
            padding: ${activeFormat === 'a4' ? '0' : '2mm'} !important;
          }
          .no-print { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            animation: none !important;
            transition: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable UI atoms                                                  */
/* ------------------------------------------------------------------ */

function DropdownItem({
  icon,
  label,
  hint,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition disabled:opacity-40 ${
        destructive
          ? 'text-rose-600 hover:bg-rose-50'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <span className={`mt-0.5 ${destructive ? 'text-rose-500' : 'text-slate-400'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{label}</div>
        {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
      </div>
    </button>
  );
}

function InfoCard({
  title,
  icon,
  accent,
  badge,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  accent: 'emerald' | 'blue';
  badge?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accents = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100' },
  } as const;
  const a = accents[accent];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>{icon}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`rounded-lg border ${a.border} ${a.bg} px-2 py-0.5 text-[10px] font-semibold ${a.text}`}>
              {badge}
            </span>
          )}
          {action}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SummaryRow({
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
  tone?: 'amber';
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`${muted ? 'text-slate-500' : 'text-slate-700'} ${bold ? 'font-semibold text-slate-800' : ''}`}>
        {label}
      </span>
      <span
        className={`${bold ? 'font-semibold text-slate-900' : 'text-slate-700'} ${
          tone === 'amber' ? 'text-amber-600' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function PreviewBar({
  label,
  onPrint,
  printLabel,
}: {
  label: string;
  onPrint: () => void;
  printLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-800 px-4 py-2.5 text-white">
      <span className="text-xs font-semibold">{label}</span>
      <button
        onClick={onPrint}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
      >
        <FiPrinter size={13} /> {printLabel}
      </button>
    </div>
  );
}

function Modal({
  children,
  onClose,
  size = 'md',
}: {
  children: React.ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' } as const;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`animate-modal-in w-full overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl ${sizes[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  icon,
  title,
  subtitle,
  onClose,
  tone = 'slate',
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClose: () => void;
  tone?: 'slate' | 'rose';
}) {
  const toneCls = tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-700';
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${toneCls}`}>{icon}</span>
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-slate-900">{title}</h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Close"
      >
        <FiX size={16} />
      </button>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function ModalFooter({
  onCancel,
  submitLabel,
  submitting,
  variant = 'purple',
}: {
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
  variant?: 'purple' | 'slate';
}) {
  const cls =
    variant === 'purple'
      ? 'bg-purple-600 hover:bg-purple-700'
      : 'bg-slate-900 hover:bg-slate-800';
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className={`rounded-xl px-5 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50 ${cls}`}
      >
        {submitLabel}
      </button>
    </div>
  );
}

function ToggleChip({
  icon,
  label,
  active,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs font-medium transition ${
        active
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white transition ${
          active ? 'bg-emerald-600' : 'bg-slate-300'
        }`}
      >
        {active ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

function FormatCard({
  title,
  subtitle,
  tone,
  onClick,
  disabled,
}: {
  title: string;
  subtitle: string;
  tone: 'slate' | 'emerald' | 'blue';
  onClick: () => void;
  disabled?: boolean;
}) {
  const tones = {
    slate: {
      border: 'border-slate-200',
      hover: 'hover:bg-slate-50 hover:border-slate-300',
      text: 'text-slate-900',
      subtext: 'text-slate-500',
    },
    emerald: {
      border: 'border-emerald-200',
      hover: 'hover:bg-emerald-50 hover:border-emerald-300',
      text: 'text-emerald-900',
      subtext: 'text-emerald-700',
    },
    blue: {
      border: 'border-blue-200',
      hover: 'hover:bg-blue-50 hover:border-blue-300',
      text: 'text-blue-900',
      subtext: 'text-blue-700',
    },
  } as const;
  const t = tones[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border p-4 text-left transition disabled:opacity-50 ${t.border} ${t.hover}`}
    >
      <div className={`text-sm font-bold ${t.text}`}>{title}</div>
      <div className={`mt-0.5 text-xs ${t.subtext}`}>{subtitle}</div>
      <div className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${t.text}`}>
        Print now <FiChevronRight size={11} />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  A4 layout                                                          */
/* ------------------------------------------------------------------ */

function QuotationA4Layout({ quotation }: { quotation: Quotation }) {
  const company = quotation.company;
  const branch = quotation.branch;

  return (
    <div className="w-full bg-white p-6 font-sans text-xs text-slate-900">
      <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
            {company?.name || 'COMPANY NAME'}
          </h1>
          {branch?.name && (
            <div className="text-xs font-semibold text-slate-700">
              Branch: {branch.name} {branch.code ? `(${branch.code})` : ''}
            </div>
          )}
          <p className="mt-1 max-w-sm text-slate-600">
            {branch?.address || company?.address || 'Address not specified'}
          </p>
          <div className="mt-1 space-x-3 text-slate-600">
            {company?.gstin && <span><strong>GSTIN:</strong> {company.gstin}</span>}
            {company?.pan && <span><strong>PAN:</strong> {company.pan}</span>}
          </div>
          <div className="space-x-3 text-slate-600">
            {(branch?.phone || company?.phone) && (
              <span><strong>Tel:</strong> {branch?.phone || company?.phone}</span>
            )}
            {(branch?.email || company?.email) && (
              <span><strong>Email:</strong> {branch?.email || company?.email}</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="inline-block rounded bg-slate-900 px-3 py-1 text-sm font-bold uppercase tracking-wider text-white">
            Sales Quotation
          </div>
          <div className="mt-2 space-y-1">
            <div className="text-sm font-black">Quote #: {quotation.quotation_number}</div>
            {quotation.reference_no && quotation.reference_no !== quotation.quotation_number && (
              <div className="text-[11px] text-slate-500">Ref: {quotation.reference_no}</div>
            )}
            <div className="text-slate-700"><strong>Date:</strong> {formatDate(quotation.quotation_date)}</div>
            <div className="text-slate-700"><strong>Valid Until:</strong> {formatDate(quotation.valid_until)}</div>
            <div className="text-slate-700">
              <strong>Status:</strong> <span className="font-semibold uppercase">{quotation.status}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="my-4 grid grid-cols-2 gap-6 rounded border border-slate-300 bg-slate-50/50 p-3">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Quotation Prepared For:
          </div>
          <div className="text-sm font-bold text-slate-900">{quotation.customer_name}</div>
          {quotation.billing_address && (
            <div className="mt-1 whitespace-pre-line text-slate-600">{quotation.billing_address}</div>
          )}
          <div className="mt-1 space-x-3 text-slate-600">
            {quotation.gstin && <span><strong>GSTIN:</strong> {quotation.gstin}</span>}
            {quotation.pan && <span><strong>PAN:</strong> {quotation.pan}</span>}
          </div>
          <div className="space-x-3 text-slate-600">
            {quotation.customer_phone && <span><strong>Phone:</strong> {quotation.customer_phone}</span>}
            {quotation.customer_email && <span><strong>Email:</strong> {quotation.customer_email}</span>}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-700">
            Shipping Destination:
          </div>
          <div className="whitespace-pre-line text-slate-600">
            {quotation.shipping_address || quotation.billing_address || 'Same as billing address'}
          </div>
          {quotation.assignee?.name && (
            <div className="mt-2 text-slate-700">
              <strong>Sales Representative:</strong> {quotation.assignee.name}
            </div>
          )}
        </div>
      </div>

      <table className="my-4 w-full border-collapse border border-slate-300 text-left">
        <thead>
          <tr className="bg-slate-200 text-[10px] font-bold uppercase text-slate-900">
            <th className="w-8 border border-slate-300 p-2 text-center">#</th>
            <th className="border border-slate-300 p-2">Item Description</th>
            <th className="w-16 border border-slate-300 p-2 text-center">HSN/SAC</th>
            <th className="w-12 border border-slate-300 p-2 text-right">Qty</th>
            <th className="w-20 border border-slate-300 p-2 text-right">Rate</th>
            <th className="w-16 border border-slate-300 p-2 text-right">Disc</th>
            <th className="w-14 border border-slate-300 p-2 text-right">GST %</th>
            <th className="w-20 border border-slate-300 p-2 text-right">Tax</th>
            <th className="w-24 border border-slate-300 p-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {(quotation.items || []).map((item, idx) => (
            <tr key={item.id || idx} className="border-b border-slate-200">
              <td className="border border-slate-300 p-2 text-center">{idx + 1}</td>
              <td className="border border-slate-300 p-2">
                <div className="font-bold text-slate-900">{item.item_name}</div>
                {item.description && <div className="text-[10px] text-slate-500">{item.description}</div>}
              </td>
              <td className="border border-slate-300 p-2 text-center font-mono">{item.hsn_code || '—'}</td>
              <td className="border border-slate-300 p-2 text-right">{item.quantity}</td>
              <td className="border border-slate-300 p-2 text-right">{safeNum(item.unit_price).toFixed(2)}</td>
              <td className="border border-slate-300 p-2 text-right">
                {safeNum(item.discount_amount) > 0 ? safeNum(item.discount_amount).toFixed(2) : '—'}
              </td>
              <td className="border border-slate-300 p-2 text-right">{item.gst_slab}%</td>
              <td className="border border-slate-300 p-2 text-right">{safeNum(item.tax_amount).toFixed(2)}</td>
              <td className="border border-slate-300 p-2 text-right font-bold">{safeNum(item.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-4 grid grid-cols-2 gap-6">
        <div className="space-y-4 text-[11px]">
          {quotation.terms_and_conditions && (
            <div>
              <div className="mb-1 font-bold uppercase tracking-wider text-slate-800">Terms & Conditions:</div>
              <p className="whitespace-pre-line rounded border border-slate-200 bg-slate-50 p-2 text-slate-600">
                {quotation.terms_and_conditions}
              </p>
            </div>
          )}
          {quotation.notes && (
            <div>
              <div className="mb-1 font-bold uppercase tracking-wider text-slate-800">Remarks / Notes:</div>
              <p className="whitespace-pre-line rounded border border-slate-200 bg-slate-50 p-2 text-slate-600">
                {quotation.notes}
              </p>
            </div>
          )}
          <div className="pt-8">
            <div className="font-bold text-slate-800">Authorized Signatory</div>
            <div className="mt-2 h-12 w-48 border-b border-dashed border-slate-400" />
            <div className="mt-1 text-[10px] text-slate-500">For {company?.name || 'Company'}</div>
          </div>
        </div>

        <div className="space-y-1.5 rounded border border-slate-300 bg-slate-50 p-3 text-xs">
          <div className="flex justify-between text-slate-700">
            <span>Subtotal:</span>
            <span>{safeNum(quotation.subtotal).toFixed(2)}</span>
          </div>
          {safeNum(quotation.discount_amount) > 0 && (
            <div className="flex justify-between text-slate-700">
              <span>Item Discount:</span>
              <span>- {safeNum(quotation.discount_amount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
            <span>Taxable Amount:</span>
            <span>{safeNum(quotation.taxable_amount).toFixed(2)}</span>
          </div>
          {safeNum(quotation.cgst_amount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>CGST:</span>
              <span>{safeNum(quotation.cgst_amount).toFixed(2)}</span>
            </div>
          )}
          {safeNum(quotation.sgst_amount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>SGST:</span>
              <span>{safeNum(quotation.sgst_amount).toFixed(2)}</span>
            </div>
          )}
          {safeNum(quotation.igst_amount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>IGST:</span>
              <span>{safeNum(quotation.igst_amount).toFixed(2)}</span>
            </div>
          )}
          {safeNum(quotation.shipping_charges) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Shipping Charges:</span>
              <span>{safeNum(quotation.shipping_charges).toFixed(2)}</span>
            </div>
          )}
          {safeNum(quotation.other_charges) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Other Charges:</span>
              <span>{safeNum(quotation.other_charges).toFixed(2)}</span>
            </div>
          )}
          {safeNum(quotation.round_off) !== 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Round Off:</span>
              <span>{safeNum(quotation.round_off).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-base font-bold text-slate-900">
            <span>TOTAL:</span>
            <span>{formatCurrency(quotation.total_amount)}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
        This is a computer-generated quotation proposal and does not constitute a tax invoice until approved and
        converted.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Thermal layout                                                     */
/* ------------------------------------------------------------------ */

function QuotationThermalLayout({ quotation, widthMm }: { quotation: Quotation; widthMm: 80 | 58 }) {
  const company = quotation.company;
  const branch = quotation.branch;
  const is58 = widthMm === 58;

  return (
    <div
      style={{
        width: `${widthMm}mm`,
        maxWidth: `${widthMm}mm`,
        margin: '0 auto',
        padding: is58 ? '1mm' : '3mm',
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: is58 ? '9px' : '11px',
        lineHeight: '1.25',
        color: '#000',
        background: '#fff',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 'bold' }}>
        <div style={{ fontSize: is58 ? '11px' : '14px', textTransform: 'uppercase' }}>
          {company?.name || 'COMPANY NAME'}
        </div>
        {branch?.name && <div>Branch: {branch.name}</div>}
        {(branch?.address || company?.address) && (
          <div style={{ fontSize: is58 ? '8px' : '10px' }}>{branch?.address || company?.address}</div>
        )}
        {(branch?.phone || company?.phone) && <div>Tel: {branch?.phone || company?.phone}</div>}
        {company?.gstin && <div>GSTIN: {company.gstin}</div>}
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: is58 ? '10px' : '12px' }}>
        QUOTATION / ESTIMATE
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Quote #:</span>
        <strong>{quotation.quotation_number}</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Date:</span>
        <span>{formatDate(quotation.quotation_date)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Valid Until:</span>
        <span>{formatDate(quotation.valid_until)}</span>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div><strong>Customer:</strong> {quotation.customer_name}</div>
      {quotation.customer_phone && <div>Ph: {quotation.customer_phone}</div>}
      {quotation.gstin && <div>Cust GST: {quotation.gstin}</div>}

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: is58 ? '8.5px' : '10.5px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left' }}>Item</th>
            <th style={{ textAlign: 'right' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Rate</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {(quotation.items || []).map((item, idx) => (
            <tr key={idx}>
              <td style={{ wordBreak: 'break-word', paddingRight: '2px' }}>{item.item_name}</td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', verticalAlign: 'top' }}>{safeNum(item.unit_price).toFixed(2)}</td>
              <td style={{ textAlign: 'right', verticalAlign: 'top', fontWeight: 'bold' }}>
                {safeNum(item.total).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ fontSize: is58 ? '9px' : '11px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Subtotal:</span>
          <span>{safeNum(quotation.subtotal).toFixed(2)}</span>
        </div>
        {safeNum(quotation.discount_amount) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Discount:</span>
            <span>-{safeNum(quotation.discount_amount).toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Tax (GST):</span>
          <span>{safeNum(quotation.tax_amount).toFixed(2)}</span>
        </div>
        {safeNum(quotation.shipping_charges) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Shipping:</span>
            <span>{safeNum(quotation.shipping_charges).toFixed(2)}</span>
          </div>
        )}
        {safeNum(quotation.other_charges) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Other:</span>
            <span>{safeNum(quotation.other_charges).toFixed(2)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid #000', margin: '2px 0' }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 'bold',
            fontSize: is58 ? '10px' : '13px',
          }}
        >
          <span>GRAND TOTAL:</span>
          <span>{safeNum(quotation.total_amount).toFixed(2)}</span>
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      <div style={{ textAlign: 'center', fontSize: is58 ? '8px' : '9.5px' }}>
        <div>Valid for 30 days from date of issue</div>
        <div>Not a Tax Invoice</div>
        <div>*** Thank You ***</div>
      </div>
    </div>
  );
}

export default QuotationDetailPage;