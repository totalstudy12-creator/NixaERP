/**
 * InvoicePrintA4.tsx
 *
 * A4-formatted printable invoice.
 * Renders company header, buyer/consignee blocks, line items, totals,
 * payment history, bank details, and the authorized-signatory footer.
 *
 * Design notes:
 *  - All derived values are computed once in `buildInvoiceView()` (pure, testable).
 *  - Sub-components receive only the slices they need (no prop drilling of `invoice`).
 *  - The logo URL is sanitized before rendering to defend against `javascript:` payloads.
 *  - Business rules (TCS, round-off, status thresholds) mirror the previous version.
 */
import React, { useMemo } from 'react';
import type { Invoice, InvoiceItem, Payment } from '../../types';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_COMPANY_NAME = 'NIXA ERP ENTERPRISES';
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Reused formatter — `Intl.NumberFormat` is expensive to construct. */
const MONEY_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DEFAULT_TERMS =
  '1. Goods once sold will not be taken back without prior authorization.\n' +
  '2. Interest @ 18% p.a. will be charged if payment is not received within due date.\n' +
  '3. Subject to jurisdiction of local courts only.';

// =============================================================================
// TYPES
// =============================================================================

/** Extra (optional) fields sometimes present on an invoice payload. */
interface InvoiceExtras {
  company?: Record<string, unknown>;
  branch?: Record<string, unknown>;
  bank?: Record<string, unknown>;
  bank_account?: Record<string, unknown>;

  packing_charges?: number | string;
  tcs_percent?: number | string;
  round_off?: number | string;

  challan_no?: string;
  po_no?: string;
  delivery_mode?: string;
  eway_no?: string;
  lr_no?: string;

  billing_street?: string;
  billing_city?: string;
  billing_state?: string;
  billing_pincode?: string;

  shipping_street?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;

  gstin?: string;
  pan?: string;
  contact_no?: string;
  customer_name?: string;
  terms_detail?: string;
  document_note?: string;
  invoice_type?: string;
}

type ExtendedInvoice = Invoice & InvoiceExtras;

interface Props {
  invoice: ExtendedInvoice;
}

interface ItemView {
  idx: number;
  name: string;
  description: string;
  hsn: string;
  qty: number;
  uom: string;
  rate: number;
  discount: number;
  gstRate: number;
  lineTotal: number;
}

interface PaymentView {
  date: string;
  mode: string;
  reference: string;
  amount: number;
}

interface InvoiceView {
  company: {
    name: string;
    addressLines: string[];
    gstin: string;
    pan: string;
    contact: string;
    website: string;
    logoUrl: string | null;
  };
  meta: {
    typeTitle: string;
    invoiceNo: string;
    invoiceDate: string;
    dueDate: string | null;
    challanNo: string | null;
    poNo: string | null;
  };
  status: { label: string; color: string; bg: string };
  billing: {
    name: string;
    addressLines: string[];
    phone: string;
    email: string;
    gstin: string;
    pan: string;
  };
  shipping: {
    hasShipping: boolean;
    addressLines: string[];
    placeOfSupply: string;
    deliveryMode: string;
    ewayNo: string;
    lrNo: string;
  };
  items: ItemView[];
  totals: {
    taxableSubtotal: number;
    discount: number;
    cgst: number;
    sgst: number;
    igst: number;
    packing: number;
    tcs: number;
    tcsPercent: number;
    roundOff: number;
    grand: number;
    paid: number;
    balance: number;
  };
  bank: {
    hasDetails: boolean;
    bankName: string;
    accountNo: string;
    ifsc: string;
    branchName: string;
  };
  payments: PaymentView[];
  terms: string;
  amountInWords: string;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

const safeNumber = (value: unknown): number => {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
};

const toStringSafe = (value: unknown): string => (value == null ? '' : String(value));

const formatMoney = (amount: number): string => MONEY_FORMATTER.format(safeNumber(amount));

const formatDate = (value: unknown): string => {
  if (!value) return '-';
  const str = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (match) {
    const [, year, month, day] = match;
    const monthIdx = parseInt(month, 10) - 1;
    return `${day} ${MONTHS_SHORT[monthIdx] ?? month} ${year}`;
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** `City, State - PIN` — omitting empty parts. */
const formatCityStatePin = (city: string, state: string, pin: string): string => {
  const loc = [city, state].filter(Boolean).join(', ');
  if (!loc) return pin ? `PIN - ${pin}` : '';
  return pin ? `${loc} - ${pin}` : loc;
};

/**
 * Only allow `http(s)://`, `data:image/*`, or app-relative paths (`/foo` but not `//`).
 * Returns `null` for anything else — prevents `javascript:` and protocol-relative abuse.
 */
const sanitizeImageUrl = (url: unknown): string | null => {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^data:image\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return null;
};

const numberToWordsINR = (amount: number): string => {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertGroup = (n: number): string => {
    if (n === 0) return '';
    const h = Math.floor(n / 100);
    const r = n % 100;
    let words = '';
    if (h > 0) words += `${units[h]} Hundred `;
    if (r === 0) return words.trim();
    if (r < 10) words += units[r];
    else if (r < 20) words += teens[r - 10];
    else {
      words += tens[Math.floor(r / 10)];
      if (r % 10) words += ` ${units[r % 10]}`;
    }
    return words.trim();
  };

  const safe = Math.max(0, safeNumber(amount));
  if (safe === 0) return 'Zero Rupees Only';

  const intPart = Math.floor(safe);
  const decPart = Math.round((safe - intPart) * 100);

  const crores = Math.floor(intPart / 10000000);
  const lakhs = Math.floor((intPart % 10000000) / 100000);
  const thousands = Math.floor((intPart % 100000) / 1000);
  const hundreds = intPart % 1000;

  const parts: string[] = [];
  if (crores > 0) parts.push(`${convertGroup(crores)} Crore`);
  if (lakhs > 0) parts.push(`${convertGroup(lakhs)} Lakh`);
  if (thousands > 0) parts.push(`${convertGroup(thousands)} Thousand`);
  if (hundreds > 0) parts.push(convertGroup(hundreds));

  let words = `${parts.join(' ').trim()} Rupees`;
  if (decPart > 0) words += ` and ${convertGroup(decPart)} Paise`;
  return `${words} Only`;
};

// =============================================================================
// VIEW MODEL BUILDER (pure — easy to unit-test)
// =============================================================================

function buildInvoiceView(inv: ExtendedInvoice): InvoiceView {
  const company = inv.company ?? {};
  const branch = inv.branch ?? {};
  const customer = (inv.customer ?? {}) as Record<string, unknown>;
  const bank = (inv.bank ?? inv.bank_account ?? {}) as Record<string, unknown>;

  // ---- Company block -----------------------------------------------------
  const companyName =
    toStringSafe(company.name) ||
    toStringSafe(branch.name) ||
    DEFAULT_COMPANY_NAME;

  const companyStreet =
    toStringSafe(branch.address) ||
    toStringSafe(company.address) ||
    toStringSafe(company.street);

  const companyCity = toStringSafe(branch.city) || toStringSafe(company.city);
  const companyState = toStringSafe(branch.state) || toStringSafe(company.state);
  const companyPin = toStringSafe(branch.pincode) || toStringSafe(company.pincode);
  const companyGstin =
    toStringSafe(company.gstin) ||
    toStringSafe(company.gst_number) ||
    toStringSafe(branch.gstin);
  const companyPan = toStringSafe(company.pan) || toStringSafe(branch.pan);
  const companyPhone =
    toStringSafe(company.phone) ||
    toStringSafe(branch.phone) ||
    toStringSafe(company.contact_no);
  const companyEmail = toStringSafe(company.email) || toStringSafe(branch.email);
  const companyWebsite = toStringSafe(company.website);

  const companyAddressLines: string[] = [];
  if (companyStreet) companyAddressLines.push(companyStreet);
  const companyCityStatePin = formatCityStatePin(companyCity, companyState, companyPin);
  if (companyCityStatePin) companyAddressLines.push(companyCityStatePin);

  const companyContact = [
    companyPhone ? `Tel: ${companyPhone}` : '',
    companyEmail,
  ].filter(Boolean).join(' | ');

  // ---- Billing block -----------------------------------------------------
  const billingName =
    toStringSafe(customer.name) ||
    toStringSafe(inv.customer_name) ||
    'Walk-in Customer';

  const billingStreet =
    toStringSafe(inv.billing_street) ||
    toStringSafe(customer.billing_street) ||
    toStringSafe(customer.address);
  const billingCity =
    toStringSafe(inv.billing_city) ||
    toStringSafe(customer.billing_city) ||
    toStringSafe(customer.city);
  const billingState =
    toStringSafe(inv.billing_state) ||
    toStringSafe(customer.billing_state) ||
    toStringSafe(customer.state);
  const billingPin =
    toStringSafe(inv.billing_pincode) ||
    toStringSafe(customer.billing_pincode) ||
    toStringSafe(customer.pincode);
  const billingPhone =
    toStringSafe(customer.phone) ||
    toStringSafe(customer.contact_no) ||
    toStringSafe(inv.contact_no);
  const billingEmail = toStringSafe(customer.email);
  const billingGstin =
    toStringSafe(inv.gstin) ||
    toStringSafe(customer.gst_number) ||
    toStringSafe(customer.gstin);
  const billingPan = toStringSafe(inv.pan) || toStringSafe(customer.pan);

  const billingAddressLines: string[] = [];
  if (billingStreet) billingAddressLines.push(billingStreet);
  const billCityStatePin = formatCityStatePin(billingCity, billingState, billingPin);
  if (billCityStatePin) billingAddressLines.push(billCityStatePin);

  // ---- Shipping block ----------------------------------------------------
  const shipStreet =
    toStringSafe(inv.shipping_street) || toStringSafe(customer.shipping_street);
  const shipCity =
    toStringSafe(inv.shipping_city) || toStringSafe(customer.shipping_city);
  const shipState =
    toStringSafe(inv.shipping_state) || toStringSafe(customer.shipping_state);
  const shipPin =
    toStringSafe(inv.shipping_pincode) || toStringSafe(customer.shipping_pincode);

  const shippingAddressLines: string[] = [];
  if (shipStreet) shippingAddressLines.push(shipStreet);
  const shipCityStatePin = formatCityStatePin(shipCity, shipState, shipPin);
  if (shipCityStatePin) shippingAddressLines.push(shipCityStatePin);

  // ---- Items + per-line tax aggregation ----------------------------------
  const rawItems: InvoiceItem[] = Array.isArray(inv.items) ? inv.items : [];
  let taxableSubtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const items: ItemView[] = rawItems.map((raw, index) => {
    const it = raw as any; // tolerate legacy field names
    const qty = safeNumber(it.quantity ?? it.qty);
    const rate = safeNumber(it.unit_price ?? it.price);
    const discount = safeNumber(it.discount_amount);
    const taxable = Math.max(0, qty * rate - discount);

    taxableSubtotal += taxable;
    totalCgst += safeNumber(it.cgst_amount);
    totalSgst += safeNumber(it.sgst_amount);
    totalIgst += safeNumber(it.igst_amount);

    return {
      idx: index + 1,
      name:
        toStringSafe(it.product?.name) ||
        toStringSafe(it.product_name) ||
        `Product #${toStringSafe(it.product_id)}`,
      description:
        toStringSafe(it.description) || toStringSafe(it.product?.description),
      hsn:
        toStringSafe(it.hsn_sac_code) ||
        toStringSafe(it.product?.hsn_sac_code) ||
        '-',
      qty,
      uom: (
        toStringSafe(it.uom) ||
        toStringSafe(it.product?.uom) ||
        toStringSafe(it.unit) ||
        toStringSafe(it.product?.unit) ||
        'NOS'
      ).toUpperCase(),
      rate,
      discount,
      gstRate: safeNumber(it.gst_slab ?? it.tax_rate ?? it.igst_percent),
      lineTotal: safeNumber(it.total),
    };
  });

  // ---- Payments ----------------------------------------------------------
  const rawPayments: Payment[] = Array.isArray(inv.payments) ? inv.payments : [];
  const payments: PaymentView[] = rawPayments.map((raw) => {
    const p = raw as any;
    return {
      date: formatDate(p.transaction_date || p.payment_date || p.created_at),
      mode: toStringSafe(p.payment_method).toUpperCase() || '-',
      reference: toStringSafe(p.reference_no),
      amount: safeNumber(p.amount),
    };
  });
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);

  // ---- Totals ------------------------------------------------------------
  const grand = safeNumber(inv.total_amount);
  const discount = safeNumber(inv.discount_amount);
  const packing = safeNumber(inv.packing_charges);
  const tcsPercent = safeNumber(inv.tcs_percent);
  const tcs = tcsPercent > 0 ? (grand * tcsPercent) / 100 : 0;
  const roundOff = safeNumber(inv.round_off);
  const balance = Math.max(0, grand - paid);

  // ---- Status badge ------------------------------------------------------
  const isPaid = balance <= 0.01;
  const isPartial = paid > 0 && !isPaid;
  const status = isPaid
    ? { label: 'PAID', color: '#15803d', bg: '#dcfce7' }
    : isPartial
      ? { label: 'PARTIAL', color: '#b45309', bg: '#fef3c7' }
      : { label: 'DUE', color: '#b91c1c', bg: '#fee2e2' };

  // ---- Bank --------------------------------------------------------------
  const bankName = toStringSafe(bank.bank_name);
  const accountNo = toStringSafe(bank.account_number) || toStringSafe(bank.account_no);
  const ifsc = toStringSafe(bank.ifsc_code) || toStringSafe(bank.ifsc);
  const branchName = toStringSafe(bank.branch_name);
  const bankDetails = {
    hasDetails: Boolean(bankName || accountNo),
    bankName,
    accountNo,
    ifsc,
    branchName,
  };

  // ---- Meta & Terms ------------------------------------------------------
  const rawType = toStringSafe(inv.invoice_type) || 'tax_invoice';
  const typeTitle = rawType.replace(/_/g, ' ').toUpperCase();

  const invoiceNo =
    toStringSafe(inv.invoice_no) || `INV-#${toStringSafe(inv.id)}`;
  const invoiceDate = formatDate(inv.invoice_date || inv.created_at);
  const dueDate = inv.due_date ? formatDate(inv.due_date) : null;
  const challanNo = toStringSafe(inv.challan_no) || null;
  const poNo = toStringSafe(inv.po_no) || null;

  const terms =
    toStringSafe(inv.terms_detail) ||
    toStringSafe(inv.document_note) ||
    DEFAULT_TERMS;

  return {
    company: {
      name: companyName,
      addressLines: companyAddressLines,
      gstin: companyGstin,
      pan: companyPan,
      contact: companyContact,
      website: companyWebsite,
      logoUrl: sanitizeImageUrl(company.logo_url ?? company.logo ?? branch.logo),
    },
    meta: { typeTitle, invoiceNo, invoiceDate, dueDate, challanNo, poNo },
    status,
    billing: {
      name: billingName,
      addressLines: billingAddressLines,
      phone: billingPhone,
      email: billingEmail,
      gstin: billingGstin,
      pan: billingPan,
    },
    shipping: {
      hasShipping: shippingAddressLines.length > 0,
      addressLines: shippingAddressLines,
      placeOfSupply: billingState || companyState || 'State of Sale',
      deliveryMode: toStringSafe(inv.delivery_mode),
      ewayNo: toStringSafe(inv.eway_no),
      lrNo: toStringSafe(inv.lr_no),
    },
    items,
    totals: {
      taxableSubtotal,
      discount,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      packing,
      tcs,
      tcsPercent,
      roundOff,
      grand,
      paid,
      balance,
    },
    bank: bankDetails,
    payments,
    terms,
    amountInWords: numberToWordsINR(grand),
  };
}

// =============================================================================
// STYLES (kept close to original for visual parity)
// =============================================================================

const INVOICE_STYLES = `
  @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
  *, *::before, *::after {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .a4-invoice-wrapper {
    width: 100%; max-width: 210mm; min-height: 297mm; margin: 0 auto;
    background: #ffffff; color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 11px; line-height: 1.45; padding: 8mm 10mm;
  }
  @media screen {
    .a4-invoice-wrapper {
      margin: 20px auto; box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      border: 1px solid #e2e8f0; border-radius: 8px;
    }
  }
  @media screen and (max-width: 768px) {
    .a4-invoice-wrapper {
      padding: 16px 12px !important;
      margin: 8px auto !important;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
      border-radius: 8px !important;
      min-height: auto !important;
      max-width: 100% !important;
    }
    .inv-header {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 12px !important;
    }
    .inv-brand {
      max-width: 100% !important;
    }
    .inv-meta-box {
      text-align: left !important;
      min-width: 0 !important;
      padding-top: 8px !important;
      border-top: 1px dashed #cbd5e1 !important;
    }
    .inv-meta-table {
      margin-left: 0 !important;
      width: 100% !important;
    }
    .inv-parties {
      grid-template-columns: 1fr !important;
      gap: 8px !important;
    }
    .inv-bottom-section {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }
    .inv-table-wrap {
      overflow-x: auto !important;
      -webkit-overflow-scrolling: touch !important;
      padding-bottom: 6px !important;
      margin-bottom: 12px !important;
    }
    table.inv-items-table {
      min-width: 640px !important;
    }
    .inv-footer {
      flex-direction: column !important;
      gap: 12px !important;
    }
    .inv-sign-block {
      text-align: left !important;
      width: 100% !important;
    }
    .inv-sign-line {
      margin-left: 0 !important;
      width: 180px !important;
    }
  }
  @media print {
    @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
    html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
    .a4-invoice-wrapper {
      box-shadow: none !important; border: none !important;
      padding: 0 !important; margin: 0 !important;
      width: 100% !important; max-width: 100% !important;
      min-height: auto !important;
    }
    .inv-header {
      flex-direction: row !important;
      align-items: flex-start !important;
    }
    .inv-brand {
      max-width: 60% !important;
    }
    .inv-meta-box {
      text-align: right !important;
      min-width: 200px !important;
      border-top: none !important;
      padding-top: 0 !important;
    }
    .inv-meta-table {
      margin-left: auto !important;
      width: auto !important;
    }
    .inv-parties {
      grid-template-columns: 1fr 1fr !important;
    }
    .inv-bottom-section {
      grid-template-columns: 1.15fr 0.85fr !important;
    }
    .inv-table-wrap {
      overflow: visible !important;
    }
    table.inv-items-table {
      min-width: 100% !important;
    }
    .inv-footer {
      flex-direction: row !important;
    }
    .inv-sign-block {
      text-align: right !important;
    }
    .inv-sign-line {
      margin-left: auto !important;
    }
    .no-print { display: none !important; }
  }

  .inv-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 12px;
  }
  .inv-brand { display: flex; align-items: flex-start; gap: 12px; max-width: 60%; }
  .inv-logo {
    width: 56px; height: 56px; object-fit: contain; border-radius: 6px;
    border: 1px solid #e2e8f0; padding: 2px;
  }
  .inv-logo-fallback {
    width: 52px; height: 52px; background: #0f172a; color: #ffffff;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 800; border-radius: 8px; letter-spacing: -0.5px;
  }
  .inv-company-name {
    font-size: 16px; font-weight: 800; color: #0f172a;
    letter-spacing: -0.3px; margin: 0 0 2px 0; text-transform: uppercase;
  }
  .inv-company-details { font-size: 10px; color: #475569; line-height: 1.35; }
  .inv-meta-box { text-align: right; min-width: 200px; }
  .inv-title {
    font-size: 20px; font-weight: 900; color: #0f172a;
    letter-spacing: 0.5px; margin: 0 0 4px 0;
  }
  .inv-badge-status {
    display: inline-block; padding: 2px 8px; border-radius: 4px;
    font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
    text-transform: uppercase; margin-bottom: 6px;
  }
  .inv-meta-table { margin-left: auto; font-size: 10.5px; border-collapse: collapse; }
  .inv-meta-table td { padding: 1.5px 4px; }
  .inv-meta-label { color: #64748b; font-weight: 500; }
  .inv-meta-val { color: #0f172a; font-weight: 700; text-align: right; }

  .inv-parties {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 12px; margin-bottom: 12px;
  }
  .party-card {
    border: 1px solid #cbd5e1; border-radius: 6px;
    padding: 8px 10px; background: #f8fafc;
  }
  .party-header {
    font-size: 9.5px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.5px; color: #475569;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px;
  }
  .party-name { font-size: 12px; font-weight: 700; color: #0f172a; margin: 0 0 2px 0; }
  .party-info { font-size: 10px; color: #475569; line-height: 1.35; }

  .inv-table-wrap { margin-bottom: 12px; }
  table.inv-items-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  table.inv-items-table thead { display: table-header-group; }
  table.inv-items-table th {
    background: #0f172a; color: #ffffff; padding: 6px 6px;
    font-weight: 700; font-size: 9.5px; text-transform: uppercase;
    letter-spacing: 0.3px; border: 1px solid #0f172a;
  }
  table.inv-items-table td {
    padding: 5px 6px; border: 1px solid #cbd5e1; vertical-align: top;
  }
  table.inv-items-table tbody tr:nth-child(even) { background: #f8fafc; }
  table.inv-items-table tr { page-break-inside: avoid; break-inside: avoid; }

  .col-center { text-align: center; }
  .col-right  { text-align: right; }
  .item-title { font-weight: 700; color: #0f172a; font-size: 10.5px; }
  .item-desc {
    color: #475569; font-size: 9.5px; margin-top: 2px;
    white-space: pre-wrap; line-height: 1.3;
  }

  .inv-bottom-section {
    display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 12px;
    page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px;
  }
  .inv-words-box, .inv-bank-box, .inv-terms-box {
    border: 1px solid #cbd5e1; border-radius: 6px;
    padding: 8px 10px; margin-bottom: 8px;
  }
  .inv-words-box { background: #f8fafc; }
  .inv-bank-box, .inv-terms-box { background: #ffffff; }
  .inv-words-title {
    font-size: 9px; font-weight: 700; text-transform: uppercase;
    color: #64748b; margin-bottom: 2px;
  }
  .inv-words-text {
    font-size: 10px; font-weight: 700; color: #0f172a; font-style: italic;
  }
  .inv-bank-title, .inv-terms-title {
    font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #0f172a;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px;
  }
  .inv-terms-text {
    font-size: 9px; color: #475569; white-space: pre-wrap; line-height: 1.35;
  }

  .inv-totals-table {
    width: 100%; border-collapse: collapse; font-size: 10.5px;
    border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden;
  }
  .inv-totals-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
  .inv-totals-table tr:last-child td { border-bottom: none; }
  .inv-grand-total { background: #0f172a !important; color: #ffffff !important; font-weight: 800; font-size: 12px; }
  .inv-grand-total td { padding: 6px 8px !important; color: #ffffff !important; }
  .inv-balance-row { background: #f1f5f9; font-weight: 700; }

  .inv-payments-table {
    width: 100%; border-collapse: collapse; font-size: 9.5px; margin-top: 4px;
  }
  .inv-payments-table th {
    background: #e2e8f0; padding: 3px 6px; font-weight: 700;
    text-align: left; color: #334155;
  }
  .inv-payments-table td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; }

  .inv-footer {
    border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 8px;
    display: flex; justify-content: space-between; align-items: flex-end;
    page-break-inside: avoid; break-inside: avoid;
  }
  .inv-sign-block { text-align: right; min-width: 180px; }
  .inv-sign-company { font-size: 10px; font-weight: 700; color: #0f172a; margin-bottom: 35px; }
  .inv-sign-line {
    border-top: 1px solid #0f172a; padding-top: 3px;
    font-size: 9.5px; font-weight: 700; color: #0f172a; text-align: center;
  }
  .inv-declaration { font-size: 8.5px; color: #64748b; max-width: 320px; line-height: 1.3; }
`;

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

const InvoiceHeader: React.FC<{
  company: InvoiceView['company'];
  meta: InvoiceView['meta'];
  status: InvoiceView['status'];
}> = ({ company, meta, status }) => (
  <div className="inv-header">
    <div className="inv-brand">
      {company.logoUrl ? (
        <img src={company.logoUrl} alt={company.name} className="inv-logo" />
      ) : (
        <div className="inv-logo-fallback">{company.name.charAt(0) || 'N'}</div>
      )}
      <div>
        <h1 className="inv-company-name">{company.name}</h1>
        <div className="inv-company-details">
          {company.addressLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          {company.gstin && <div><strong>GSTIN:</strong> {company.gstin}</div>}
          {company.pan && <div><strong>PAN:</strong> {company.pan}</div>}
          {company.contact && <div>{company.contact}</div>}
          {company.website && <div>{company.website}</div>}
        </div>
      </div>
    </div>

    <div className="inv-meta-box">
      <div className="inv-title">{meta.typeTitle}</div>
      <div
        className="inv-badge-status"
        style={{ color: status.color, backgroundColor: status.bg }}
      >
        ● {status.label}
      </div>

      <table className="inv-meta-table">
        <tbody>
          <tr>
            <td className="inv-meta-label">Invoice No:</td>
            <td className="inv-meta-val">{meta.invoiceNo}</td>
          </tr>
          <tr>
            <td className="inv-meta-label">Invoice Date:</td>
            <td className="inv-meta-val">{meta.invoiceDate}</td>
          </tr>
          {meta.dueDate && (
            <tr>
              <td className="inv-meta-label">Due Date:</td>
              <td className="inv-meta-val">{meta.dueDate}</td>
            </tr>
          )}
          {meta.challanNo && (
            <tr>
              <td className="inv-meta-label">Challan No:</td>
              <td className="inv-meta-val">{meta.challanNo}</td>
            </tr>
          )}
          {meta.poNo && (
            <tr>
              <td className="inv-meta-label">PO No:</td>
              <td className="inv-meta-val">{meta.poNo}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const PartiesGrid: React.FC<{
  billing: InvoiceView['billing'];
  shipping: InvoiceView['shipping'];
}> = ({ billing, shipping }) => (
  <div className="inv-parties">
    <div className="party-card">
      <div className="party-header">Billed To (Customer / Buyer)</div>
      <div className="party-name">{billing.name}</div>
      <div className="party-info">
        {billing.addressLines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {billing.phone && <div><strong>Phone:</strong> {billing.phone}</div>}
        {billing.email && <div><strong>Email:</strong> {billing.email}</div>}
        {billing.gstin && <div><strong>GSTIN:</strong> {billing.gstin}</div>}
        {billing.pan && <div><strong>PAN:</strong> {billing.pan}</div>}
      </div>
    </div>

    <div className="party-card">
      <div className="party-header">
        {shipping.hasShipping ? 'Shipped To (Consignee)' : 'Place of Supply & Transport'}
      </div>
      {shipping.hasShipping ? (
        <div className="party-info">
          <div className="party-name">{billing.name}</div>
          {shipping.addressLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      ) : (
        <div className="party-info">
          <div><strong>Place of Supply:</strong> {shipping.placeOfSupply}</div>
          {shipping.deliveryMode && <div><strong>Delivery Mode:</strong> {shipping.deliveryMode}</div>}
          {shipping.ewayNo && <div><strong>E-Way Bill:</strong> {shipping.ewayNo}</div>}
          {shipping.lrNo && <div><strong>LR / RR No:</strong> {shipping.lrNo}</div>}
        </div>
      )}
    </div>
  </div>
);

const ItemsTable: React.FC<{ items: ItemView[] }> = ({ items }) => (
  <div className="inv-table-wrap">
    <table className="inv-items-table">
      <thead>
        <tr>
          <th style={{ width: '28px' }} className="col-center">#</th>
          <th>Description of Goods / Services</th>
          <th style={{ width: '60px' }} className="col-center">HSN/SAC</th>
          <th style={{ width: '55px' }} className="col-right">Qty</th>
          <th style={{ width: '45px' }} className="col-center">Unit</th>
          <th style={{ width: '70px' }} className="col-right">Rate (₹)</th>
          <th style={{ width: '55px' }} className="col-right">Disc</th>
          <th style={{ width: '50px' }} className="col-center">GST %</th>
          <th style={{ width: '75px' }} className="col-right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={9} className="col-center" style={{ color: '#94a3b8', padding: '16px' }}>
              No line items on this invoice.
            </td>
          </tr>
        ) : (
          items.map((item) => (
            <tr key={item.idx}>
              <td className="col-center">{item.idx}</td>
              <td>
                <div className="item-title">{item.name}</div>
                {item.description && <div className="item-desc">{item.description}</div>}
              </td>
              <td className="col-center" style={{ fontFamily: 'monospace' }}>{item.hsn}</td>
              <td className="col-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(3)}
              </td>
              <td className="col-center" style={{ color: '#64748b', textTransform: 'uppercase' }}>
                {item.uom}
              </td>
              <td className="col-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(item.rate)}
              </td>
              <td className="col-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.discount > 0 ? formatMoney(item.discount) : '-'}
              </td>
              <td className="col-center" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {item.gstRate > 0 ? `${item.gstRate}%` : '0%'}
              </td>
              <td className="col-right" style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                {formatMoney(item.lineTotal)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

const SidePanels: React.FC<{
  amountInWords: string;
  bank: InvoiceView['bank'];
  payments: PaymentView[];
  terms: string;
}> = ({ amountInWords, bank, payments, terms }) => (
  <div>
    <div className="inv-words-box">
      <div className="inv-words-title">Invoice Amount in Words</div>
      <div className="inv-words-text">{amountInWords}</div>
    </div>

    {bank.hasDetails && (
      <div className="inv-bank-box">
        <div className="inv-bank-title">Bank Payment Details</div>
        <div style={{ fontSize: '9.5px', color: '#334155', lineHeight: 1.4 }}>
          {bank.bankName && <div><strong>Bank:</strong> {bank.bankName}</div>}
          {bank.accountNo && <div><strong>A/C No:</strong> {bank.accountNo}</div>}
          {bank.ifsc && <div><strong>IFSC:</strong> {bank.ifsc}</div>}
          {bank.branchName && <div><strong>Branch:</strong> {bank.branchName}</div>}
        </div>
      </div>
    )}

    {payments.length > 0 && (
      <div className="inv-bank-box">
        <div className="inv-bank-title">Payment History</div>
        <table className="inv-payments-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref / Mode</th>
              <th style={{ textAlign: 'right' }}>Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i}>
                <td>{p.date}</td>
                <td>
                  <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{p.mode}</span>
                  {p.reference ? ` (${p.reference})` : ''}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatMoney(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}

    <div className="inv-terms-box">
      <div className="inv-terms-title">Terms &amp; Conditions</div>
      <div className="inv-terms-text">{terms}</div>
    </div>
  </div>
);

const TotalsPanel: React.FC<{ totals: InvoiceView['totals'] }> = ({ totals }) => {
  const t = totals;
  return (
    <div>
      <table className="inv-totals-table">
        <tbody>
          <tr>
            <td style={{ color: '#64748b' }}>Taxable Amount:</td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.taxableSubtotal)}</td>
          </tr>
          {t.discount > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>Total Discount:</td>
              <td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>
                -₹{formatMoney(t.discount)}
              </td>
            </tr>
          )}
          {t.cgst > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>CGST:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.cgst)}</td>
            </tr>
          )}
          {t.sgst > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>SGST:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.sgst)}</td>
            </tr>
          )}
          {t.igst > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>IGST:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.igst)}</td>
            </tr>
          )}
          {t.packing > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>Packing &amp; Forwarding:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.packing)}</td>
            </tr>
          )}
          {t.tcsPercent > 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>TCS ({t.tcsPercent}%):</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{formatMoney(t.tcs)}</td>
            </tr>
          )}
          {t.roundOff !== 0 && (
            <tr>
              <td style={{ color: '#64748b' }}>Round Off:</td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                {t.roundOff > 0
                  ? `+₹${formatMoney(t.roundOff)}`
                  : `-₹${formatMoney(Math.abs(t.roundOff))}`}
              </td>
            </tr>
          )}
          <tr className="inv-grand-total">
            <td>GRAND TOTAL:</td>
            <td style={{ textAlign: 'right' }}>₹{formatMoney(t.grand)}</td>
          </tr>
          <tr>
            <td style={{ color: '#16a34a', fontWeight: 600 }}>Amount Paid:</td>
            <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 700 }}>
              ₹{formatMoney(t.paid)}
            </td>
          </tr>
          <tr className="inv-balance-row">
            <td style={{ color: t.balance > 0 ? '#dc2626' : '#16a34a' }}>Balance Due:</td>
            <td
              style={{
                textAlign: 'right',
                color: t.balance > 0 ? '#dc2626' : '#16a34a',
                fontWeight: 800,
              }}
            >
              ₹{formatMoney(t.balance)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const InvoiceFooter: React.FC<{ companyName: string }> = ({ companyName }) => (
  <div className="inv-footer">
    <div className="inv-declaration">
      <div><strong>Declaration:</strong></div>
      We declare that this invoice shows the actual price of the goods described and that all
      particulars are true and correct.
    </div>
    <div className="inv-sign-block">
      <div className="inv-sign-company">For {companyName}</div>
      <div className="inv-sign-line">Authorized Signatory</div>
    </div>
  </div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const InvoicePrintA4: React.FC<Props> = ({ invoice }) => {
  const view = useMemo(() => (invoice ? buildInvoiceView(invoice) : null), [invoice]);

  if (!view) return null;

  return (
    <div className="a4-invoice-wrapper">
      <style>{INVOICE_STYLES}</style>
      <InvoiceHeader company={view.company} meta={view.meta} status={view.status} />
      <PartiesGrid billing={view.billing} shipping={view.shipping} />
      <ItemsTable items={view.items} />
      <div className="inv-bottom-section">
        <SidePanels
          amountInWords={view.amountInWords}
          bank={view.bank}
          payments={view.payments}
          terms={view.terms}
        />
        <TotalsPanel totals={view.totals} />
      </div>
      <InvoiceFooter companyName={view.company.name} />
    </div>
  );
};

export default InvoicePrintA4;