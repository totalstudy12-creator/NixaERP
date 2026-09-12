// src/utils/ledgerA4.ts
//
// Builds an A4-sized, print-ready Customer Ledger / Statement of Account
// and sends it to the browser's print dialog (choose "Save as PDF").
//
// No external dependency required.

import { apiClient } from '../api';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface LedgerEntry {
  id?: number | string;
  date?: string | null;
  type?: string;              // invoice | payment | opening | credit_note | ...
  reference_no?: string | null;
  particulars?: string | null;
  narration?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  status?: string | null;
  /**
   * Optional link to an invoice. Populated by the backend on payment
   * rows when the payment was applied against a specific invoice.
   */
  invoice_id?: number | string | null;
  invoice_no?: string | null;
  [key: string]: unknown;
}

/** Structural subset of the CustomersPage `Customer` type. */
export interface LedgerCustomerLike {
  id: number;
  name: string;
  type?: string;
  gst_number?: string;
  pan?: string;
  email?: string;
  contact_no?: string;
  contact_person?: string;
  billing_street?: string;
  billing_landmark?: string;
  billing_city?: string;
  billing_state?: string;
  billing_pincode?: string;
  billing_country?: string;
  opening_balance?: number | string;
  outstanding_amount?: number | string;
  credit_limit?: number | string;
  company?: { name?: string } | null;
  branch?: { name?: string } | null;
}

export interface LedgerMeta {
  /** Overrides `customer.company?.name`. */
  companyName?: string;
  /** Overrides `customer.branch?.name`. */
  branchName?: string;
  /** e.g. "01 Apr 2026 – 12 Sep 2026" or "As on 12 Sep 2026". */
  periodLabel?: string;
  /** Printed under the title, e.g. a GSTIN of the issuing company. */
  companyGst?: string;
  companyAddress?: string;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (
    response &&
    typeof response === 'object' &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: T[] }).data;
  }
  return [];
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 1234.5 -> "1,234.50" */
function inr(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNum(value));
}

/** 1234.5 -> "₹ 1,234.50" */
function money(value: unknown): string {
  return `\u20B9 ${inr(value)}`;
}

/** "2026-09-12..." -> "12 Sep 2026" */
function fmtDate(value?: string | null): string {
  if (!value) return '\u2014';
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '\u2014';
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return '\u2014';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function todayLabel(): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());
}

/**
 * Return the first non-empty property value from the object.
 * Tolerates multiple possible field names for the same logical value.
 */
function pick<T = unknown>(
  obj: Record<string, unknown> | null | undefined,
  keys: string[]
): T | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== undefined && val !== null && val !== '') return val as T;
  }
  return undefined;
}

/**
 * Normalize a date-like value to "YYYY-MM-DD" (or '').
 */
function normalizeDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const ts = Date.parse(String(value));
  if (Number.isNaN(ts)) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Extract an invoice number from a raw payment row.
 *
 * The payments API can return the invoice number under a nested
 * `invoice` object (typical when eager-loading), or flattened as
 * `invoice_no` / `invoice_number`.
 */
function readInvoiceNumberFromPayment(
  raw: Record<string, unknown>
): string | null {
  // Nested invoice object: { invoice: { invoice_no: "..." } }
  const nested = raw.invoice as Record<string, unknown> | undefined;
  if (nested && typeof nested === 'object') {
    const no = pick<string>(nested, ['invoice_no', 'invoice_number', 'number']);
    if (no) return String(no);
  }

  // Flat columns
  const flat = pick<string>(raw, ['invoice_no', 'invoice_number']);
  if (flat) return String(flat);

  return null;
}

/* ------------------------------------------------------------------ */
/* Amount in words (Indian numbering system)                           */
/* ------------------------------------------------------------------ */

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ` ${ONES[o]}` : '');
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return `${ONES[h]} Hundred${r ? ` ${twoDigits(r)}` : ''}`;
}

function amountInWords(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  let words: string;
  if (rupees === 0) {
    words = 'Zero';
  } else {
    const crore = Math.floor(rupees / 10000000);
    const lakh = Math.floor((rupees % 10000000) / 100000);
    const thousand = Math.floor((rupees % 100000) / 1000);
    const rest = rupees % 1000;

    const parts: string[] = [];
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
    if (rest) parts.push(threeDigits(rest));
    words = parts.join(' ');
  }

  let out = `${negative ? 'Minus ' : ''}${words} Rupees`;
  if (paise) out += ` and ${twoDigits(paise)} Paise`;
  return `${out} Only`;
}

/* ------------------------------------------------------------------ */
/* Data fetching                                                       */
/* ------------------------------------------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  invoice: 'Sales',
  sales: 'Sales',
  payment: 'Receipt',
  receipt: 'Receipt',
  credit_note: 'Credit Note',
  debit_note: 'Debit Note',
  opening: 'Opening',
  journal: 'Journal',
  order: 'Order',
};

function entryParticulars(entry: LedgerEntry): string {
  const explicit = entry.particulars ?? entry.narration;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const ref = entry.reference_no ? String(entry.reference_no) : '';
  const kind = TYPE_LABEL[String(entry.type ?? '').toLowerCase()] ?? 'Transaction';

  // If this is a payment with a linked invoice and no particulars,
  // synthesize a reasonable fallback.
  if (
    String(entry.type ?? '').toLowerCase() === 'payment' &&
    entry.invoice_no
  ) {
    const base = ref ? `${kind} ${ref}` : kind;
    return `${base} against ${entry.invoice_no}`;
  }

  return ref ? `${kind} ${ref}` : kind;
}

/**
 * Fetches the customer ledger from every available source and merges
 * the results. This is intentionally redundant: the dedicated ledger
 * endpoint is preferred, but the raw /invoices + /payments endpoints
 * are ALWAYS queried too, so a backend bug in one source never hides
 * transactions that exist in another.
 */
async function fetchLedgerEntries(customerId: number): Promise<LedgerEntry[]> {
  const [primary, fallback] = await Promise.all([
    fetchFromLedgerEndpoints(customerId),
    deriveLedgerEntries(customerId),
  ]);

  return mergeEntries(primary, fallback);
}

/* ------------------------------------------------------------------ */
/* Primary path — dedicated ledger endpoints                           */
/* ------------------------------------------------------------------ */

async function fetchFromLedgerEndpoints(customerId: number): Promise<LedgerEntry[]> {
  const candidates = [
    `/customers/${customerId}/ledger`,
    `/ledger?customer_id=${customerId}`,
    `/customers/${customerId}/ledger-entries`,
  ];

  for (const url of candidates) {
    try {
      const res = await apiClient.request('GET', url);
      const list = unwrapList<LedgerEntry>(res);
      if (list.length) return list;
    } catch {
      /* try next */
    }
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Merge — dedupe by (type, reference_no, date, amount)                */
/* ------------------------------------------------------------------ */

function entryKey(entry: LedgerEntry): string {
  const type = String(entry.type ?? '');
  const ref  = String(entry.reference_no ?? '');
  const date = String(entry.date ?? '').slice(0, 10);
  const amt  = `${safeNum(entry.debit)}|${safeNum(entry.credit)}`;
  return `${type}::${ref}::${date}::${amt}`;
}

function mergeEntries(
  primary: LedgerEntry[],
  secondary: LedgerEntry[]
): LedgerEntry[] {
  const seen = new Set<string>();
  const merged: LedgerEntry[] = [];

  for (const entry of primary) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  for (const entry of secondary) {
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/* Fallback derivation — field-name tolerant                           */
/* ------------------------------------------------------------------ */

interface ListEndpointResult {
  ok: boolean;
  rows: Record<string, unknown>[];
}

async function tryListEndpoint(url: string): Promise<ListEndpointResult> {
  try {
    const res = await apiClient.request('GET', url);
    return { ok: true, rows: unwrapList<Record<string, unknown>>(res) };
  } catch {
    return { ok: false, rows: [] };
  }
}

async function deriveLedgerEntries(customerId: number): Promise<LedgerEntry[]> {
  const [inv, pay, cn, ret] = await Promise.all([
    tryListEndpoint(`/invoices?customer_id=${customerId}&per_page=500`),
    tryListEndpoint(`/payments?customer_id=${customerId}&per_page=500`),
    tryListEndpoint(`/credit-notes?customer_id=${customerId}&per_page=500`),
    tryListEndpoint(`/sales-returns?customer_id=${customerId}&per_page=500`),
  ]);

  const entries: LedgerEntry[] = [];

  /* ---------- Invoices → DEBIT ---------- */
  if (inv.ok) {
    inv.rows.forEach((raw, index) => {
      const ref =
        pick<string>(raw, ['invoice_no', 'number', 'reference_no']) ??
        `#${(raw.id as number | string | undefined) ?? index + 1}`;

      const date = normalizeDate(
        pick(raw, ['invoice_date', 'date', 'created_at'])
      );

      // Prefer total_amount over grand_total — some schemas keep
      // grand_total as 0.00 while total_amount is the real value.
      const amount = (() => {
        const candidates = [
          'total_amount',
          'grand_total',
          'net_amount',
          'invoice_total',
          'amount',
        ];
        for (const key of candidates) {
          const v = raw[key];
          if (v === undefined || v === null || v === '') continue;
          const n = safeNum(v);
          if (n > 0) return n;
        }
        // Fallback: return the first numeric, even if 0.
        for (const key of candidates) {
          const v = raw[key];
          if (v === undefined || v === null || v === '') continue;
          return safeNum(v);
        }
        return 0;
      })();

      entries.push({
        id: `inv-${(raw.id as number | string | undefined) ?? index}`,
        date,
        type: 'invoice',
        reference_no: String(ref),
        particulars: `Sales Invoice ${ref}`,
        debit: amount,
        credit: 0,
        status: (raw.status as string) ?? null,
      });
    });
  }

  /* ---------- Payments → CREDIT (inward) or DEBIT (outward) ---------- */
  if (pay.ok) {
    pay.rows.forEach((raw, index) => {
      // Filter polymorphic rows that obviously aren't customers.
      const partyType = pick<string>(raw, ['party_type']);
      if (partyType) {
        const normalized = String(partyType).toLowerCase();
        const isCustomer =
          normalized === 'customer' ||
          normalized === 'customers' ||
          normalized.includes('customer');
        if (!isCustomer) return;
      }

      const ref =
        pick<string>(raw, [
          'reference_no',
          'payment_no',
          'voucher_no',
          'receipt_no',
        ]) ?? `#${(raw.id as number | string | undefined) ?? index + 1}`;

      const date = normalizeDate(
        pick(raw, ['transaction_date', 'payment_date', 'date', 'created_at'])
      );

      const rawDirection =
        pick<string>(raw, ['payment_direction', 'direction', 'type']) ?? '';
      const direction = String(rawDirection).toLowerCase();

      const outward = [
        'outward',
        'payment',
        'debit',
        'paid',
        'payout',
      ].includes(direction);
      const inward = !outward;

      const amount = safeNum(pick(raw, ['amount', 'total_amount']));
      const method = pick<string>(raw, ['payment_method', 'method']);

      /* ------- NEW: resolve the linked invoice number ------- */
      const invoiceNo = readInvoiceNumberFromPayment(raw);
      const invoiceId =
        pick<number | string>(raw, ['invoice_id', 'paymentable_id']) ?? null;

      const label = inward ? 'Receipt' : 'Payment';
      const parts: string[] = [`${label} ${ref}`];
      if (invoiceNo) parts.push(`against ${invoiceNo}`);
      if (method) parts.push(`(${method})`);
      const particulars = parts.join(' ');

      entries.push({
        id: `pay-${(raw.id as number | string | undefined) ?? index}`,
        date,
        type: 'payment',
        reference_no: String(ref),
        particulars,
        debit: inward ? 0 : amount,
        credit: inward ? amount : 0,
        status: (raw.status as string) ?? null,
        invoice_id: invoiceId,
        invoice_no: invoiceNo,
      });
    });
  }

  /* ---------- Credit notes → CREDIT ---------- */
  if (cn.ok) {
    cn.rows.forEach((raw, index) => {
      const ref =
        pick<string>(raw, ['credit_note_no', 'reference_no', 'number']) ??
        `#${(raw.id as number | string | undefined) ?? index + 1}`;

      const date = normalizeDate(
        pick(raw, ['credit_note_date', 'date', 'created_at'])
      );

      const amount = safeNum(pick(raw, ['total_amount', 'amount']));

      entries.push({
        id: `cn-${(raw.id as number | string | undefined) ?? index}`,
        date,
        type: 'credit_note',
        reference_no: String(ref),
        particulars: `Credit Note ${ref}`,
        debit: 0,
        credit: amount,
        status: (raw.status as string) ?? null,
      });
    });
  }

  /* ---------- Sales returns → CREDIT ---------- */
  if (ret.ok) {
    ret.rows.forEach((raw, index) => {
      const ref =
        pick<string>(raw, ['return_no', 'reference_no', 'number']) ??
        `#${(raw.id as number | string | undefined) ?? index + 1}`;

      const date = normalizeDate(
        pick(raw, ['return_date', 'date', 'created_at'])
      );

      const amount = safeNum(pick(raw, ['total_amount', 'amount']));

      entries.push({
        id: `ret-${(raw.id as number | string | undefined) ?? index}`,
        date,
        type: 'credit_note',
        reference_no: String(ref),
        particulars: `Sales Return ${ref}`,
        debit: 0,
        credit: amount,
        status: (raw.status as string) ?? null,
      });
    });
  }

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[ledgerA4] fallback entries', {
      customerId,
      invoices: inv.ok ? inv.rows.length : 'failed',
      payments: pay.ok ? pay.rows.length : 'failed',
      creditNotes: cn.ok ? cn.rows.length : 'skipped',
      salesReturns: ret.ok ? ret.rows.length : 'skipped',
      totalEntries: entries.length,
    });
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* HTML builder                                                        */
/* ------------------------------------------------------------------ */

interface ComputedRow {
  index: number;
  date: string;
  typeLabel: string;
  reference: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
}

function buildLedgerHtml(
  customer: LedgerCustomerLike,
  entries: LedgerEntry[],
  meta: LedgerMeta = {}
): string {
  const sorted = [...entries].sort((a, b) => {
    const da = String(a.date ?? '').slice(0, 10);
    const db = String(b.date ?? '').slice(0, 10);
    if (da === db) return 0;
    return da < db ? -1 : 1;
  });

  const opening = safeNum(customer.opening_balance);
  let running = opening;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: ComputedRow[] = sorted.map((entry, i) => {
    const debit = safeNum(entry.debit);
    const credit = safeNum(entry.credit);
    totalDebit += debit;
    totalCredit += credit;
    running += debit - credit;

    return {
      index: i + 1,
      date: fmtDate(entry.date),
      typeLabel: TYPE_LABEL[String(entry.type ?? '').toLowerCase()] ?? '—',
      reference: entry.reference_no ? String(entry.reference_no) : '—',
      particulars: entryParticulars(entry),
      debit,
      credit,
      balance: running,
    };
  });

  const closing = opening + totalDebit - totalCredit;

  const companyName = meta.companyName || customer.company?.name || 'Company';
  const branchName = meta.branchName || customer.branch?.name || '';
  const periodLabel = meta.periodLabel || `As on ${todayLabel()}`;

  const addressLines = [
    customer.billing_street,
    customer.billing_landmark,
    [customer.billing_city, customer.billing_state, customer.billing_pincode]
      .filter(Boolean)
      .join(', '),
    customer.billing_country,
  ].filter((line) => typeof line === 'string' && line.trim());

  const bodyRows = rows
    .map(
      (row) => `
      <tr>
        <td class="c-idx">${row.index}</td>
        <td class="c-date">${esc(row.date)}</td>
        <td class="c-type">${esc(row.typeLabel)}</td>
        <td class="c-ref">${esc(row.reference)}</td>
        <td class="c-part">${esc(row.particulars)}</td>
        <td class="c-amt">${row.debit ? inr(row.debit) : '—'}</td>
        <td class="c-amt">${row.credit ? inr(row.credit) : '—'}</td>
        <td class="c-amt c-bal">${inr(Math.abs(row.balance))}
          <span class="dr">${row.balance >= 0 ? 'Dr' : 'Cr'}</span>
        </td>
      </tr>`
    )
    .join('');

  const emptyRow = `
    <tr class="empty">
      <td colspan="8">No transactions recorded for this customer.</td>
    </tr>`;

  const balWord = amountInWords(closing);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ledger \u2013 ${esc(customer.name)}</title>
<style>
  * { box-sizing: border-box; }

  @page { size: A4 portrait; margin: 12mm 10mm 14mm 10mm; }

  html, body { margin: 0; padding: 0; background: #ffffff; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, sans-serif;
    font-size: 10px;
    line-height: 1.35;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .sheet { width: 190mm; margin: 0 auto; padding: 4mm 0; }

  @media print {
    .sheet { width: 100%; margin: 0; padding: 0; }
  }

  /* ---------- header ---------- */
  .doc-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #0f172a;
  }
  .brand { display: flex; align-items: center; gap: 9px; min-width: 0; }
  .brand-mark {
    width: 34px; height: 34px; flex: 0 0 34px;
    display: grid; place-items: center;
    border-radius: 8px;
    background: #0f172a; color: #ffffff;
    font-size: 13px; font-weight: 700; letter-spacing: .5px;
  }
  .brand-name { font-size: 13px; font-weight: 700; letter-spacing: -.2px; }
  .brand-sub { font-size: 9px; color: #64748b; margin-top: 1px; }

  .doc-title { text-align: right; }
  .doc-title-main {
    font-size: 15px; font-weight: 700; letter-spacing: .4px;
    text-transform: uppercase;
  }
  .doc-title-sub { font-size: 9px; color: #64748b; margin-top: 2px; }

  /* ---------- meta grid ---------- */
  .meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    margin-top: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }
  .meta-col { padding: 8px 10px; }
  .meta-col + .meta-col { border-left: 1px solid #e2e8f0; }

  .meta-label {
    font-size: 8px; font-weight: 700; letter-spacing: .9px;
    text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;
  }
  .meta-name { font-size: 12px; font-weight: 700; color: #0f172a; }
  .meta-line { font-size: 9.5px; color: #475569; margin-top: 1px; }
  .meta-kv { display: flex; gap: 6px; font-size: 9.5px; margin-top: 2px; }
  .meta-kv .k { color: #94a3b8; min-width: 62px; }
  .meta-kv .v { color: #1e293b; font-weight: 600; word-break: break-word; }

  /* ---------- summary strip ---------- */
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0;
    margin-top: 10px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    overflow: hidden;
  }
  .sum-cell { padding: 7px 9px; }
  .sum-cell + .sum-cell { border-left: 1px solid #e2e8f0; }
  .sum-label {
    font-size: 8px; font-weight: 700; letter-spacing: .8px;
    text-transform: uppercase; color: #94a3b8;
  }
  .sum-value {
    font-size: 12px; font-weight: 700; margin-top: 3px;
    font-variant-numeric: tabular-nums;
  }
  .sum-value.dr { color: #b91c1c; }
  .sum-value.cr { color: #047857; }
  .sum-value.plain { color: #0f172a; }

  /* ---------- ledger table ---------- */
  .table-wrap { margin-top: 12px; }

  table.ledger {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  table.ledger thead { display: table-header-group; }
  table.ledger tr { page-break-inside: avoid; }

  table.ledger th {
    background: #f1f5f9;
    border-top: 1px solid #cbd5e1;
    border-bottom: 1px solid #cbd5e1;
    padding: 6px 6px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: .7px;
    text-transform: uppercase;
    color: #475569;
    text-align: left;
    white-space: nowrap;
  }
  table.ledger th.c-amt { text-align: right; }

  table.ledger td {
    padding: 5px 6px;
    border-bottom: 1px solid #eef2f7;
    font-size: 9.5px;
    color: #1e293b;
    vertical-align: top;
    word-wrap: break-word;
  }

  .c-idx  { width: 22px; text-align: center; color: #94a3b8; }
  .c-date { width: 60px; white-space: nowrap; }
  .c-type { width: 52px; white-space: nowrap; color: #475569; }
  .c-ref  { width: 72px; }
  .c-part { width: auto; }
  .c-amt  { width: 66px; text-align: right; white-space: nowrap;
            font-variant-numeric: tabular-nums; }
  .c-bal  { font-weight: 700; }
  .c-bal .dr { font-size: 7.5px; color: #94a3b8; margin-left: 2px; font-weight: 600; }

  tbody tr:nth-child(even) td { background: #fafbfc; }

  tr.empty td {
    text-align: center;
    color: #94a3b8;
    padding: 22px 6px;
    font-style: italic;
  }

  tfoot td {
    border-top: 2px solid #0f172a;
    border-bottom: none;
    padding: 6px 6px;
    font-size: 10px;
    font-weight: 700;
    background: #f8fafc;
  }
  tfoot td.c-amt { text-align: right; font-variant-numeric: tabular-nums; }

  /* ---------- closing balance band ---------- */
  .closing {
    margin-top: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
  }
  .closing .label {
    font-size: 9px; font-weight: 700; letter-spacing: .8px;
    text-transform: uppercase; color: #475569;
  }
  .closing .words { font-size: 9px; color: #64748b; margin-top: 3px; }
  .closing .value {
    font-size: 14px; font-weight: 700;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .closing .value.dr { color: #b91c1c; }
  .closing .value.cr { color: #047857; }

  /* ---------- footer ---------- */
  .doc-foot {
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 8px;
    color: #94a3b8;
  }
  .sign {
    margin-top: 26px;
    text-align: right;
    font-size: 9px;
    color: #475569;
  }
  .sign-line {
    display: inline-block;
    min-width: 150px;
    padding-top: 4px;
    border-top: 1px solid #94a3b8;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="sheet">

    <header class="doc-head">
      <div class="brand">
        <div class="brand-mark">${esc(companyName.slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="brand-name">${esc(companyName)}</div>
          ${branchName ? `<div class="brand-sub">${esc(branchName)}</div>` : ''}
          ${meta.companyAddress ? `<div class="brand-sub">${esc(meta.companyAddress)}</div>` : ''}
          ${meta.companyGst ? `<div class="brand-sub">GSTIN: ${esc(meta.companyGst)}</div>` : ''}
        </div>
      </div>
      <div class="doc-title">
        <div class="doc-title-main">Customer Ledger</div>
        <div class="doc-title-sub">Statement of Account</div>
        <div class="doc-title-sub">${esc(periodLabel)}</div>
      </div>
    </header>

    <section class="meta">
      <div class="meta-col">
        <div class="meta-label">Account holder</div>
        <div class="meta-name">${esc(customer.name)}</div>
        ${
          addressLines.length
            ? addressLines.map((line) => `<div class="meta-line">${esc(line)}</div>`).join('')
            : '<div class="meta-line">Address not provided</div>'
        }
      </div>
      <div class="meta-col">
        <div class="meta-label">Account details</div>
        <div class="meta-kv"><span class="k">Account ID</span><span class="v">#${esc(customer.id)}</span></div>
        ${
          customer.type
            ? `<div class="meta-kv"><span class="k">Type</span><span class="v" style="text-transform:capitalize">${esc(customer.type)}</span></div>`
            : ''
        }
        ${
          customer.contact_person
            ? `<div class="meta-kv"><span class="k">Contact</span><span class="v">${esc(customer.contact_person)}</span></div>`
            : ''
        }
        ${
          customer.contact_no
            ? `<div class="meta-kv"><span class="k">Phone</span><span class="v">${esc(customer.contact_no)}</span></div>`
            : ''
        }
        ${
          customer.email
            ? `<div class="meta-kv"><span class="k">Email</span><span class="v">${esc(customer.email)}</span></div>`
            : ''
        }
        ${
          customer.gst_number
            ? `<div class="meta-kv"><span class="k">GSTIN</span><span class="v">${esc(customer.gst_number)}</span></div>`
            : ''
        }
        ${
          customer.pan
            ? `<div class="meta-kv"><span class="k">PAN</span><span class="v">${esc(customer.pan)}</span></div>`
            : ''
        }
      </div>
    </section>

    <section class="summary">
      <div class="sum-cell">
        <div class="sum-label">Opening balance</div>
        <div class="sum-value plain">${money(opening)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Total debit</div>
        <div class="sum-value plain">${money(totalDebit)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Total credit</div>
        <div class="sum-value plain">${money(totalCredit)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Closing balance</div>
        <div class="sum-value ${closing > 0 ? 'dr' : closing < 0 ? 'cr' : 'plain'}">
          ${money(Math.abs(closing))} ${closing >= 0 ? 'Dr' : 'Cr'}
        </div>
      </div>
    </section>

    <div class="table-wrap">
      <table class="ledger">
        <colgroup>
          <col style="width:22px" />
          <col style="width:60px" />
          <col style="width:52px" />
          <col style="width:72px" />
          <col />
          <col style="width:66px" />
          <col style="width:66px" />
          <col style="width:72px" />
        </colgroup>
        <thead>
          <tr>
            <th class="c-idx">#</th>
            <th>Date</th>
            <th>Type</th>
            <th>Voucher</th>
            <th>Particulars</th>
            <th class="c-amt">Debit</th>
            <th class="c-amt">Credit</th>
            <th class="c-amt">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="c-idx">0</td>
            <td class="c-date">—</td>
            <td class="c-type">Opening</td>
            <td class="c-ref">—</td>
            <td class="c-part">Opening Balance</td>
            <td class="c-amt">—</td>
            <td class="c-amt">—</td>
            <td class="c-amt c-bal">${inr(Math.abs(opening))}
              <span class="dr">${opening >= 0 ? 'Dr' : 'Cr'}</span>
            </td>
          </tr>
          ${rows.length ? bodyRows : emptyRow}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5">Total</td>
            <td class="c-amt">${inr(totalDebit)}</td>
            <td class="c-amt">${inr(totalCredit)}</td>
            <td class="c-amt">${inr(Math.abs(closing))}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <section class="closing">
      <div>
        <div class="label">Closing balance</div>
        <div class="words">${esc(balWord)}</div>
      </div>
      <div class="value ${closing > 0 ? 'dr' : closing < 0 ? 'cr' : ''}">
        ${money(Math.abs(closing))} ${closing >= 0 ? 'Dr' : 'Cr'}
      </div>
    </section>

    <div class="sign">
      <span class="sign-line">Authorised Signatory</span>
    </div>

    <footer class="doc-foot">
      <span>Generated on ${esc(todayLabel())} · This is a computer-generated statement.</span>
      <span>${esc(companyName)}${branchName ? ` · ${esc(branchName)}` : ''}</span>
    </footer>

  </div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Printing                                                            */
/* ------------------------------------------------------------------ */

function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Ledger print frame');
  // Full A4 size, off-screen — display:none / 0x0 iframes print blank in some browsers.
  frame.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:210mm',
    'height:297mm',
    'border:0',
    'opacity:0',
    'pointer-events:none',
  ].join(';');

  document.body.appendChild(frame);

  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;

    const win = frame.contentWindow;
    if (win) {
      try {
        win.focus();
        win.print();
      } catch {
        /* the user can still print the opened document manually */
      }
    }
    // Remove only after the print dialog has had time to grab the document.
    window.setTimeout(() => frame.remove(), 60_000);
  };

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Let fonts / layout settle before handing the document to the print dialog.
  if (doc.readyState === 'complete') {
    window.setTimeout(run, 350);
  } else {
    frame.onload = () => window.setTimeout(run, 350);
  }

  // Safety net in case `onload` never fires.
  window.setTimeout(run, 1500);
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fetches the customer ledger and opens the browser print dialog with a
 * properly paginated A4 statement. Choose "Save as PDF" to download it.
 *
 * @example
 *   await downloadCustomerLedgerA4(customer, { companyName: 'Acme Pvt Ltd' });
 */
export async function downloadCustomerLedgerA4(
  customer: LedgerCustomerLike,
  meta: LedgerMeta = {}
): Promise<void> {
  const entries = await fetchLedgerEntries(customer.id);
  const html = buildLedgerHtml(customer, entries, meta);
  printHtml(html);
}

/** Alias — same behaviour, reads better at some call sites. */
export const openCustomerLedgerA4 = downloadCustomerLedgerA4;

/** Exposed for tests / custom flows. */
export { buildLedgerHtml, fetchLedgerEntries };