// src/pages/CustomersPage.tsx
import React, {
  useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, memo,
  type DragEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  FiPlus, FiTrash2, FiEdit, FiDownload, FiUpload, FiUsers, FiShoppingBag,
  FiTruck, FiPackage, FiAlertCircle, FiFilter, FiX, FiFile, FiCheck,
  FiAlertTriangle, FiChevronDown, FiEye, FiEyeOff, FiMoreVertical,
  FiBookOpen, FiFileText, FiCreditCard, FiActivity, FiExternalLink,
  FiMail, FiPhone, FiMapPin, FiCalendar, FiPrinter, FiDollarSign,
} from 'react-icons/fi';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const Offcanvas = lazy(() =>
  import('../components/Offcanvas').then((m) => ({ default: m.Offcanvas })),
);

/* ── Types ── */

type CustomerType = 'customer' | 'dealer' | 'distributor';
type DuplicateAction = 'skip' | 'update' | 'stop';
type DetailTab = 'overview' | 'invoices' | 'payments' | 'orders' | 'activity';

interface Company { id: number; name: string }
interface Branch { id: number; name: string; company_id?: number }
interface CustomerGroup { id: number; name: string }

interface Customer {
  id: number;
  name: string;
  type: CustomerType;
  company_type?: string;
  email?: string;
  contact_no?: string;
  contact_person?: string;
  gst_number?: string;
  registration_type?: string;
  pan?: string;
  billing_street?: string; billing_landmark?: string; billing_city?: string;
  billing_state?: string; billing_country?: string; billing_pincode?: string;
  shipping_street?: string; shipping_landmark?: string; shipping_city?: string;
  shipping_state?: string; shipping_country?: string; shipping_pincode?: string;
  eway_bill_distance?: number | string;
  group_id?: number | null;
  group?: CustomerGroup;
  opening_balance?: number;
  credit_limit?: number;
  due_days?: number;
  outstanding_amount?: number | string;
  computed_outstanding?: number | string;
  fax?: string; website?: string; note?: string; license_no?: string;
  custom_field_1?: string; custom_field_2?: string;
  is_active: boolean;
  company_id: number | null;
  branch_id: number | null;
  company?: Company;
  branch?: Branch;
}

interface CustomerFormData {
  name: string; type: CustomerType; company_type: string;
  email: string; contact_no: string; contact_person: string;
  gst_number: string; registration_type: string; pan: string;
  billing_street: string; billing_landmark: string; billing_city: string;
  billing_state: string; billing_country: string; billing_pincode: string;
  shipping_street: string; shipping_landmark: string; shipping_city: string;
  shipping_state: string; shipping_country: string; shipping_pincode: string;
  eway_bill_distance: number | string; group_id: number | string;
  opening_balance: number | string; credit_limit: number | string;
  due_days: number | string; outstanding_amount?: number | string;
  fax: string; website: string; note: string; license_no: string;
  custom_field_1: string; custom_field_2: string;
  is_active: boolean;
  company_id: number | null | string;
  branch_id: number | null | string;
  same_as_billing: boolean;
}

interface InvoiceSummaryRow {
  id: number; invoice_no?: string; total_amount?: number | string;
  status?: string; invoice_date?: string; due_date?: string | null;
  payment_status?: string;
  [key: string]: unknown;
}
interface PaymentRow {
  id: number; reference_no?: string; amount?: number | string;
  payment_method?: string; payment_direction?: string; status?: string;
  transaction_date?: string;
  [key: string]: unknown;
}
interface OrderSummaryRow {
  id: number; order_no?: string; total_amount?: number | string;
  status?: string; source?: string; delivery_date?: string | null;
  created_at?: string;
  [key: string]: unknown;
}

interface ActivityEntry {
  id: string;
  type: 'invoice' | 'payment' | 'order';
  title: string; subtitle: string; amount: number; date: string;
  status?: string;
}

interface ImportPreviewRow {
  row: number; data: Record<string, unknown>;
  valid: boolean; errors: Record<string, string>;
  name: string; email: string;
}
interface ImportSummary {
  total: number; valid: number; invalid: number;
  created?: number; updated?: number; skipped?: number; failed?: number;
}
interface ImportError { row: number; field: string; message: string }
interface GstLookupResult {
  company_name?: string; billing_street?: string; billing_city?: string;
  billing_state?: string; billing_pincode?: string; billing_country?: string;
  registration_type?: string; pan?: string;
}
interface AppLogEntry {
  module: string; action: string;
  status: 'success' | 'error' | 'info';
  message: string;
}
interface ApiErrorLike {
  message?: string; status?: number;
  response?: { status?: number };
}

/* ── Constants ── */

const CACHE_TTL_MS = 300_000;
const TABLE_COLUMN_COUNT = 9;
const RELATED_LIMIT = 10;
const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'customer', label: 'Customer' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'distributor', label: 'Distributor' },
] as const;

const TABLE_HEAD_CLASS = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const OWNERSHIP_KEYS = ['customer_id', 'party_id', 'dealer_id', 'client_id', 'contact_id'] as const;

/* ── Safe helpers ── */

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const candidate = (error as ApiErrorLike).message;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function safeLog(entry: AppLogEntry): void {
  try { addAppLog(entry); } catch { /* no-op */ }
}

function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  if (response && typeof response === 'object') {
    const data = (response as { data?: unknown }).data;
    if (Array.isArray(data)) return data as T[];
  }
  return [];
}

function escapeCsvField(value: unknown): string {
  const raw = String(value ?? '');
  const dangerous = /^[=+\-@\t\r]/.test(raw);
  const safe = dangerous ? `\t${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 2,
  }).format(safeNum(value));
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const v = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '—';
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

/** Authoritative outstanding. Prefers server-computed value. */
function getOutstanding(customer: Customer | null | undefined): number {
  if (!customer) return 0;
  const raw = customer.computed_outstanding ?? customer.outstanding_amount;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function filterByOwnership<T extends Record<string, unknown>>(
  rows: T[],
  customerId: number,
): T[] {
  if (rows.length === 0) return rows;
  const hasOwnershipField = rows.some((row) =>
    OWNERSHIP_KEYS.some((k) => row[k] != null && row[k] !== ''),
  );
  if (!hasOwnershipField) return rows;
  return rows.filter((row) =>
    OWNERSHIP_KEYS.some((k) => {
      const v = row[k];
      if (v == null || v === '') return false;
      return Number(v) === customerId;
    }),
  );
}

/* ── Ledger utilities ── */

function htmlEscape(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function inrPlain(v: unknown): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(safeNum(v));
}
function inrMoney(v: unknown): string { return `\u20B9 ${inrPlain(v)}`; }
function todayLabel(): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date());
}

const ONES = ['', 'One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
const TENS = ['', '', 'Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? ` ${ONES[o]}` : '');
}
function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100), r = n % 100;
  return `${ONES[h]} Hundred${r ? ` ${twoDigits(r)}` : ''}`;
}
function amountInWords(value: number): string {
  const negative = value < 0, abs = Math.abs(value);
  const rupees = Math.floor(abs), paise = Math.round((abs - rupees) * 100);
  let words: string;
  if (rupees === 0) words = 'Zero';
  else {
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

interface LedgerEntry {
  id?: number | string;
  date?: string | null;
  type?: string;
  reference_no?: string | null;
  particulars?: string | null;
  narration?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
  status?: string | null;
  [key: string]: unknown;
}
interface LedgerSummary {
  opening_balance?: number;
  total_debit: number;
  total_credit: number;
  balance: number;
  [key: string]: unknown;
}

const LEDGER_TYPE_LABEL: Record<string, string> = {
  invoice: 'Sales', sales: 'Sales',
  payment: 'Receipt', receipt: 'Receipt',
  credit_note: 'Credit Note', debit_note: 'Debit Note',
  opening: 'Opening', journal: 'Journal', order: 'Order',
};

function ledgerEntryParticulars(entry: LedgerEntry): string {
  const explicit = entry.particulars ?? entry.narration;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  const ref = entry.reference_no ? String(entry.reference_no) : '';
  const kind = LEDGER_TYPE_LABEL[String(entry.type ?? '').toLowerCase()] ?? 'Transaction';
  return ref ? `${kind} ${ref}` : kind;
}

async function fetchLedger(
  customerId: number,
): Promise<{ entries: LedgerEntry[]; summary: LedgerSummary | null }> {
  const res = await apiClient.request('GET', `/customers/${customerId}/ledger`);
  const entries = unwrapList<LedgerEntry>(res);
  const summary = (res as { summary?: LedgerSummary })?.summary ?? null;
  const owned = filterByOwnership(entries as unknown as Record<string, unknown>[], customerId) as unknown as LedgerEntry[];
  return { entries: owned, summary };
}

function buildLedgerHtml(customer: Customer, entries: LedgerEntry[], serverSummary: LedgerSummary | null): string {
  const sorted = [...entries].sort((a, b) => {
    const da = String(a.date ?? '').slice(0, 10);
    const db = String(b.date ?? '').slice(0, 10);
    return da === db ? 0 : da < db ? -1 : 1;
  });

  const opening = safeNum(customer.opening_balance);
  let running = opening;
  let totalDebit = 0, totalCredit = 0;

  const rows = sorted.map((entry, i) => {
    const debit = safeNum(entry.debit);
    const credit = safeNum(entry.credit);
    totalDebit += debit; totalCredit += credit;
    running += debit - credit;
    return {
      index: i + 1,
      date: formatDate(entry.date),
      typeLabel: LEDGER_TYPE_LABEL[String(entry.type ?? '').toLowerCase()] ?? '—',
      reference: entry.reference_no ? String(entry.reference_no) : '—',
      particulars: ledgerEntryParticulars(entry),
      debit, credit, balance: running,
    };
  });

  const closing = serverSummary ? safeNum(serverSummary.balance) : opening + totalDebit - totalCredit;

  const companyName = customer.company?.name || 'Company';
  const branchName = customer.branch?.name || '';

  const addressLines = [
    customer.billing_street, customer.billing_landmark,
    [customer.billing_city, customer.billing_state, customer.billing_pincode].filter(Boolean).join(', '),
    customer.billing_country,
  ].filter((l) => typeof l === 'string' && l.trim());

  const bodyRows = rows.map((r) => `
      <tr>
        <td class="c-idx">${r.index}</td>
        <td class="c-date">${htmlEscape(r.date)}</td>
        <td class="c-type">${htmlEscape(r.typeLabel)}</td>
        <td class="c-ref">${htmlEscape(r.reference)}</td>
        <td class="c-part">${htmlEscape(r.particulars)}</td>
        <td class="c-amt">${r.debit ? inrPlain(r.debit) : '—'}</td>
        <td class="c-amt">${r.credit ? inrPlain(r.credit) : '—'}</td>
        <td class="c-amt c-bal">${inrPlain(Math.abs(r.balance))}
          <span class="dr">${r.balance >= 0 ? 'Dr' : 'Cr'}</span>
        </td>
      </tr>`).join('');

  const emptyRow = `<tr class="empty"><td colspan="8">No transactions recorded for this customer.</td></tr>`;
  const balWord = amountInWords(closing);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Ledger \u2013 ${htmlEscape(customer.name)}</title>
<style>
  *{box-sizing:border-box}
  @page{size:A4 portrait;margin:12mm 10mm 14mm 10mm}
  html,body{margin:0;padding:0;background:#fff}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:10px;line-height:1.35;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{width:190mm;margin:0 auto;padding:4mm 0}
  @media print{.sheet{width:100%;margin:0;padding:0}}
  .doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:8px;border-bottom:2px solid #0f172a}
  .brand{display:flex;align-items:center;gap:9px;min-width:0}
  .brand-mark{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;border-radius:8px;background:#0f172a;color:#fff;font-size:13px;font-weight:700;letter-spacing:.5px}
  .brand-name{font-size:13px;font-weight:700;letter-spacing:-.2px}
  .brand-sub{font-size:9px;color:#64748b;margin-top:1px}
  .doc-title{text-align:right}
  .doc-title-main{font-size:15px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
  .doc-title-sub{font-size:9px;color:#64748b;margin-top:2px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
  .meta-col{padding:8px 10px}
  .meta-col+.meta-col{border-left:1px solid #e2e8f0}
  .meta-label{font-size:8px;font-weight:700;letter-spacing:.9px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}
  .meta-name{font-size:12px;font-weight:700;color:#0f172a}
  .meta-line{font-size:9.5px;color:#475569;margin-top:1px}
  .meta-kv{display:flex;gap:6px;font-size:9.5px;margin-top:2px}
  .meta-kv .k{color:#94a3b8;min-width:62px}
  .meta-kv .v{color:#1e293b;font-weight:600;word-break:break-word}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:10px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
  .sum-cell{padding:7px 9px}
  .sum-cell+.sum-cell{border-left:1px solid #e2e8f0}
  .sum-label{font-size:8px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#94a3b8}
  .sum-value{font-size:12px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums}
  .sum-value.dr{color:#b91c1c}
  .sum-value.cr{color:#047857}
  .sum-value.plain{color:#0f172a}
  .table-wrap{margin-top:12px}
  table.ledger{width:100%;border-collapse:collapse;table-layout:fixed}
  table.ledger thead{display:table-header-group}
  table.ledger tr{page-break-inside:avoid}
  table.ledger th{background:#f1f5f9;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:6px;font-size:8.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#475569;text-align:left;white-space:nowrap}
  table.ledger th.c-amt{text-align:right}
  table.ledger td{padding:5px 6px;border-bottom:1px solid #eef2f7;font-size:9.5px;color:#1e293b;vertical-align:top;word-wrap:break-word}
  .c-idx{width:22px;text-align:center;color:#94a3b8}
  .c-date{width:60px;white-space:nowrap}
  .c-type{width:52px;white-space:nowrap;color:#475569}
  .c-ref{width:72px}
  .c-part{width:auto}
  .c-amt{width:66px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .c-bal{font-weight:700}
  .c-bal .dr{font-size:7.5px;color:#94a3b8;margin-left:2px;font-weight:600}
  tbody tr:nth-child(even) td{background:#fafbfc}
  tr.empty td{text-align:center;color:#94a3b8;padding:22px 6px;font-style:italic}
  tfoot td{border-top:2px solid #0f172a;border-bottom:none;padding:6px;font-size:10px;font-weight:700;background:#f8fafc}
  tfoot td.c-amt{text-align:right;font-variant-numeric:tabular-nums}
  .closing{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc}
  .closing .label{font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#475569}
  .closing .words{font-size:9px;color:#64748b;margin-top:3px}
  .closing .value{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
  .closing .value.dr{color:#b91c1c}
  .closing .value.cr{color:#047857}
  .doc-foot{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:12px;font-size:8px;color:#94a3b8}
  .sign{margin-top:26px;text-align:right;font-size:9px;color:#475569}
  .sign-line{display:inline-block;min-width:150px;padding-top:4px;border-top:1px solid #94a3b8;text-align:center}
</style></head><body>
  <div class="sheet">
    <header class="doc-head">
      <div class="brand">
        <div class="brand-mark">${htmlEscape(companyName.slice(0, 2).toUpperCase())}</div>
        <div>
          <div class="brand-name">${htmlEscape(companyName)}</div>
          ${branchName ? `<div class="brand-sub">${htmlEscape(branchName)}</div>` : ''}
        </div>
      </div>
      <div class="doc-title">
        <div class="doc-title-main">Customer Ledger</div>
        <div class="doc-title-sub">Statement of Account</div>
        <div class="doc-title-sub">As on ${htmlEscape(todayLabel())}</div>
      </div>
    </header>

    <section class="meta">
      <div class="meta-col">
        <div class="meta-label">Account holder</div>
        <div class="meta-name">${htmlEscape(customer.name)}</div>
        ${addressLines.length ? addressLines.map((l) => `<div class="meta-line">${htmlEscape(l)}</div>`).join('') : '<div class="meta-line">Address not provided</div>'}
      </div>
      <div class="meta-col">
        <div class="meta-label">Account details</div>
        <div class="meta-kv"><span class="k">Account ID</span><span class="v">#${htmlEscape(customer.id)}</span></div>
        ${customer.type ? `<div class="meta-kv"><span class="k">Type</span><span class="v" style="text-transform:capitalize">${htmlEscape(customer.type)}</span></div>` : ''}
        ${customer.contact_person ? `<div class="meta-kv"><span class="k">Contact</span><span class="v">${htmlEscape(customer.contact_person)}</span></div>` : ''}
        ${customer.contact_no ? `<div class="meta-kv"><span class="k">Phone</span><span class="v">${htmlEscape(customer.contact_no)}</span></div>` : ''}
        ${customer.email ? `<div class="meta-kv"><span class="k">Email</span><span class="v">${htmlEscape(customer.email)}</span></div>` : ''}
        ${customer.gst_number ? `<div class="meta-kv"><span class="k">GSTIN</span><span class="v">${htmlEscape(customer.gst_number)}</span></div>` : ''}
        ${customer.pan ? `<div class="meta-kv"><span class="k">PAN</span><span class="v">${htmlEscape(customer.pan)}</span></div>` : ''}
      </div>
    </section>

    <section class="summary">
      <div class="sum-cell">
        <div class="sum-label">Opening balance</div>
        <div class="sum-value plain">${inrMoney(opening)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Total debit</div>
        <div class="sum-value plain">${inrMoney(totalDebit)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Total credit</div>
        <div class="sum-value plain">${inrMoney(totalCredit)}</div>
      </div>
      <div class="sum-cell">
        <div class="sum-label">Closing balance</div>
        <div class="sum-value ${closing > 0 ? 'dr' : closing < 0 ? 'cr' : 'plain'}">
          ${inrMoney(Math.abs(closing))} ${closing >= 0 ? 'Dr' : 'Cr'}
        </div>
      </div>
    </section>

    <div class="table-wrap">
      <table class="ledger">
        <colgroup>
          <col style="width:22px" /><col style="width:60px" /><col style="width:52px" />
          <col style="width:72px" /><col /><col style="width:66px" /><col style="width:66px" /><col style="width:72px" />
        </colgroup>
        <thead><tr>
          <th class="c-idx">#</th><th>Date</th><th>Type</th><th>Voucher</th>
          <th>Particulars</th><th class="c-amt">Debit</th><th class="c-amt">Credit</th><th class="c-amt">Balance</th>
        </tr></thead>
        <tbody>
          <tr>
            <td class="c-idx">0</td><td class="c-date">—</td><td class="c-type">Opening</td>
            <td class="c-ref">—</td><td class="c-part">Opening Balance</td>
            <td class="c-amt">—</td><td class="c-amt">—</td>
            <td class="c-amt c-bal">${inrPlain(Math.abs(opening))}
              <span class="dr">${opening >= 0 ? 'Dr' : 'Cr'}</span>
            </td>
          </tr>
          ${rows.length ? bodyRows : emptyRow}
        </tbody>
        <tfoot><tr>
          <td colspan="5">Total</td>
          <td class="c-amt">${inrPlain(totalDebit)}</td>
          <td class="c-amt">${inrPlain(totalCredit)}</td>
          <td class="c-amt">${inrPlain(Math.abs(closing))}</td>
        </tr></tfoot>
      </table>
    </div>

    <section class="closing">
      <div>
        <div class="label">Closing balance</div>
        <div class="words">${htmlEscape(balWord)}</div>
      </div>
      <div class="value ${closing > 0 ? 'dr' : closing < 0 ? 'cr' : ''}">
        ${inrMoney(Math.abs(closing))} ${closing >= 0 ? 'Dr' : 'Cr'}
      </div>
    </section>

    <div class="sign"><span class="sign-line">Authorised Signatory</span></div>

    <footer class="doc-foot">
      <span>Generated on ${htmlEscape(todayLabel())} · Computer-generated statement.</span>
      <span>${htmlEscape(companyName)}${branchName ? ` · ${htmlEscape(branchName)}` : ''}</span>
    </footer>
  </div>
</body></html>`;
}

function printLedgerHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Ledger print frame');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);

  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    const win = frame.contentWindow;
    if (win) { try { win.focus(); win.print(); } catch { /* user prints manually */ } }
    window.setTimeout(() => { if (frame.parentNode) frame.remove(); }, 60_000);
  };

  const doc = frame.contentDocument;
  if (!doc) { frame.remove(); return; }

  doc.open(); doc.write(html); doc.close();

  if (doc.readyState === 'complete') window.setTimeout(run, 350);
  else frame.onload = () => window.setTimeout(run, 350);
  window.setTimeout(run, 1500);
}

/* ── Cached API hook ── */

interface CacheEntry<T> { data: T; timestamp: number }
const cache = new Map<string, CacheEntry<unknown>>();

function useApiCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = CACHE_TTL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);

  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  const fetchData = useCallback(async (skipCache = false) => {
    const requestId = ++requestIdRef.current;
    if (!skipCache) {
      const entry = cache.get(key);
      if (entry && Date.now() - entry.timestamp < ttlMs) {
        if (!mountedRef.current || requestId !== requestIdRef.current) return;
        setData(entry.data as T);
        setLoading(false);
        setError(null);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetcherRef.current();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      const result = Array.isArray(res) ? (res as T) : ((res as { data?: T })?.data ?? ([] as unknown as T));
      cache.set(key, { data: result, timestamp: Date.now() });
      setData(result);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setError(getErrorMessage(err, 'Failed to load'));
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) setLoading(false);
    }
  }, [key, ttlMs]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchData();
    return () => { mountedRef.current = false; requestIdRef.current += 1; };
  }, [fetchData]);

  const refresh = useCallback(() => { cache.delete(key); return fetchData(true); }, [fetchData, key]);

  return { data, loading, error, refresh };
}

/* ── Presentation primitives ── */

function TableHeadLabel({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''} ${TABLE_HEAD_CLASS}`}>
      {children}
    </span>
  );
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  paid:      { label: 'Paid',       className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700' },
  partial:   { label: 'Partial',    className: 'border-sky-200/70 bg-sky-50 text-sky-700' },
  unpaid:    { label: 'Unpaid',     className: 'border-amber-200/70 bg-amber-50 text-amber-700' },
  overdue:   { label: 'Overdue',    className: 'border-red-200/70 bg-red-50 text-red-700' },
  pending:   { label: 'Pending',    className: 'border-amber-200/70 bg-amber-50 text-amber-700' },
  confirmed: { label: 'Confirmed',  className: 'border-sky-200/70 bg-sky-50 text-sky-700' },
  shipped:   { label: 'Shipped',    className: 'border-violet-200/70 bg-violet-50 text-violet-700' },
  delivered: { label: 'Delivered',  className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700' },
  completed: { label: 'Completed',  className: 'border-emerald-200/70 bg-emerald-50 text-emerald-700' },
  draft:     { label: 'Draft',      className: 'border-slate-200 bg-slate-50 text-slate-600' },
  issued:    { label: 'Issued',     className: 'border-indigo-200/70 bg-indigo-50 text-indigo-700' },
  failed:    { label: 'Failed',     className: 'border-red-200/70 bg-red-50 text-red-700' },
};

const StatusPill = memo(function StatusPill({ status }: { status?: string | null }) {
  const value = String(status ?? '').toLowerCase();
  const { label, className } = STATUS_MAP[value] ?? { label: status || '—', className: 'border-slate-200 bg-slate-50 text-slate-600' };
  return (
    <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </Badge>
  );
});

const StatCardSkeleton = memo(() => (
  <div className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4">
    <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200" />
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
      <div className="h-6 w-16 animate-pulse rounded bg-slate-200" />
    </div>
  </div>
));
StatCardSkeleton.displayName = 'StatCardSkeleton';

type Accent = 'indigo' | 'emerald' | 'rose' | 'amber' | 'violet' | 'teal' | 'sky';

const ACCENTS: Record<Accent, { bg: string; icon: string; ring: string }> = {
  indigo:  { bg: 'bg-indigo-50',  icon: 'text-indigo-600',  ring: 'ring-indigo-500/10' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-500/10' },
  rose:    { bg: 'bg-rose-50',    icon: 'text-rose-600',    ring: 'ring-rose-500/10' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   ring: 'ring-amber-500/10' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-600',  ring: 'ring-violet-500/10' },
  teal:    { bg: 'bg-teal-50',    icon: 'text-teal-600',    ring: 'ring-teal-500/10' },
  sky:     { bg: 'bg-sky-50',     icon: 'text-sky-600',     ring: 'ring-sky-500/10' },
};

const StatCard = memo(function StatCard({
  icon: Icon, label, value, accent = 'indigo', prefix,
}: { icon: React.ElementType; label: string; value: string | number; accent?: Accent; prefix?: string }) {
  const s = ACCENTS[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300/80 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {prefix}{value}
          </p>
        </div>
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${s.bg} ring-1 ${s.ring}`}>
          <Icon size={18} className={s.icon} />
        </div>
      </div>
    </div>
  );
});

/* ── Row actions ── */

const MENU_WIDTH = 210, MENU_HEIGHT = 200, MENU_MARGIN = 8;

const ActionDropdown = memo(function ActionDropdown({
  customer, onEdit, onLedger, onLedgerA4, onDelete, ledgerLoading,
}: {
  customer: Customer;
  onEdit: (c: Customer) => void;
  onLedger: (c: Customer) => void;
  onLedgerA4: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  ledgerLoading?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => {
    if (isOpen) { setIsOpen(false); return; }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(MENU_MARGIN, rect.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - MENU_MARGIN);
      const top = rect.bottom + MENU_HEIGHT <= window.innerHeight - MENU_MARGIN
        ? rect.bottom + 4
        : Math.max(MENU_MARGIN, rect.top - MENU_HEIGHT - 4);
      setMenuStyle({ position: 'fixed', left, top, width: MENU_WIDTH, zIndex: 9999 });
    }
    setIsOpen(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current && !buttonRef.current.contains(target) && menuRef.current && !menuRef.current.contains(target)) setIsOpen(false);
    };
    const onScrollOrResize = () => setIsOpen(false);
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [isOpen]);

  return (
    <>
      <button ref={buttonRef} type="button"
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${isOpen ? 'bg-slate-100 text-slate-700' : ''}`}
        title="Actions" aria-haspopup="menu" aria-expanded={isOpen}>
        <FiMoreVertical size={16} />
      </button>

      {isOpen && createPortal(
        <div ref={menuRef} role="menu" style={menuStyle} onClick={(e) => e.stopPropagation()}
          className="animate-fadeIn overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10">
          <button type="button" role="menuitem"
            onClick={() => { setIsOpen(false); onEdit(customer); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
            <FiEdit size={14} className="text-indigo-500" /> Edit
          </button>
          <button type="button" role="menuitem"
            onClick={() => { setIsOpen(false); onLedger(customer); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50">
            <FiBookOpen size={14} className="text-emerald-500" /> Ledger
          </button>
          <button type="button" role="menuitem" disabled={ledgerLoading}
            onClick={() => { if (ledgerLoading) return; setIsOpen(false); onLedgerA4(customer); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
            <FiPrinter size={14} className="text-sky-500" />
            {ledgerLoading ? 'Preparing…' : 'Ledger (A4)'}
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" role="menuitem"
            onClick={() => { setIsOpen(false); onDelete(customer); }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50">
            <FiTrash2 size={14} /> Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
});

/* ── Form field ── */

interface FormTextFieldProps {
  label: string; field: string;
  type?: 'text' | 'number' | 'email' | 'tel';
  required?: boolean;
  value: string | number;
  hasError?: boolean;
  onChange: (field: string, value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

const FormTextField = memo(function FormTextField({
  label, field, type = 'text', required = false, value, hasError = false,
  onChange, placeholder, maxLength,
}: FormTextFieldProps) {
  const id = `field-${field}`;
  const stateClass = hasError
    ? 'border-rose-300 ring-2 ring-rose-200'
    : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10';
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <input id={id} type={type} value={value as string | number}
        onChange={(e) => onChange(field, e.target.value)}
        className={`h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition ${stateClass}`}
        placeholder={placeholder ?? `Enter ${label}`}
        step={type === 'number' ? '0.01' : undefined}
        maxLength={maxLength} />
    </div>
  );
});

function EmptyTab({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white ring-1 ring-slate-200/70">
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

/* ── Initial form ── */

const createEmptyForm = (): CustomerFormData => ({
  name: '', type: 'customer', company_type: '', email: '', contact_no: '', contact_person: '',
  gst_number: '', registration_type: '', pan: '',
  billing_street: '', billing_landmark: '', billing_city: '', billing_state: '',
  billing_country: 'India', billing_pincode: '',
  shipping_street: '', shipping_landmark: '', shipping_city: '', shipping_state: '',
  shipping_country: 'India', shipping_pincode: '',
  eway_bill_distance: '', group_id: '', opening_balance: '', credit_limit: '',
  due_days: '', outstanding_amount: '', fax: '', website: '', note: '', license_no: '',
  custom_field_1: '', custom_field_2: '', is_active: true,
  company_id: '', branch_id: '', same_as_billing: true,
});

/* ── Page component ── */

export function CustomersPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [filterType, setFilterType] = useState('all');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>(createEmptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingGroup, setAddingGroup] = useState(false);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'result'>('select');
  const [importLoading, setImportLoading] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [importResultMessage, setImportResultMessage] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [detailLoading, setDetailLoading] = useState(false);
  const [customerInvoices, setCustomerInvoices] = useState<InvoiceSummaryRow[]>([]);
  const [customerPayments, setCustomerPayments] = useState<PaymentRow[]>([]);
  const [customerOrders, setCustomerOrders] = useState<OrderSummaryRow[]>([]);
  const detailRequestRef = useRef(0);

  const [ledgerLoadingId, setLedgerLoadingId] = useState<number | null>(null);
  const [outstandingVisibleIds, setOutstandingVisibleIds] = useState<Set<number>>(new Set());
  const [lookingUp, setLookingUp] = useState(false);

  const { data: customers, loading: custLoading, error: custError, refresh: refreshCustomers } =
    useApiCache<Customer[]>('customers', () => apiClient.getCustomers());
  const { data: companies } = useApiCache<Company[]>('companies', () => apiClient.getCompanies());
  const { data: branches } = useApiCache<Branch[]>('branches', () => apiClient.getBranches());
  const { data: customerGroups, refresh: refreshGroups } = useApiCache<CustomerGroup[]>(
    'customerGroups', () => apiClient.getCustomerGroups(),
  );

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    let list = customers;
    if (filterType !== 'all') list = list.filter((c) => c.type === filterType);
    if (filterCompany !== 'all') {
      const cid = Number.parseInt(filterCompany, 10);
      if (!Number.isNaN(cid)) list = list.filter((c) => c.company_id === cid);
    }
    if (filterBranch !== 'all') {
      const bid = Number.parseInt(filterBranch, 10);
      if (!Number.isNaN(bid)) list = list.filter((c) => c.branch_id === bid);
    }
    return list;
  }, [customers, filterType, filterCompany, filterBranch]);

  const summary = useMemo(() => {
    const list = customers ?? [];
    const byType = (t: CustomerType) => list.filter((c) => c.type === t);
    const sum = (rows: Customer[]) => rows.reduce((a, c) => a + getOutstanding(c), 0);
    const customerList = byType('customer');
    const dealerList = byType('dealer');
    const distributorList = byType('distributor');
    return {
      total: list.length,
      customersCount: customerList.length,
      dealers: dealerList.length,
      distributors: distributorList.length,
      totalOutstanding: sum(list),
      outstandingCustomers: sum(customerList),
      outstandingDealers: sum(dealerList),
      outstandingDistributors: sum(distributorList),
    };
  }, [customers]);

  const activeFilterCount = useMemo(
    () => [filterType, filterCompany, filterBranch].filter((v) => v !== 'all').length,
    [filterType, filterCompany, filterBranch],
  );

  const clearFilters = useCallback(() => {
    setFilterType('all'); setFilterCompany('all'); setFilterBranch('all');
  }, []);

  const allSelected = useMemo(
    () => filteredCustomers.length > 0 && filteredCustomers.every((c) => selectedIds.includes(c.id)),
    [filteredCustomers, selectedIds],
  );

  const toggleSelectAll = useCallback(() => {
    const ids = filteredCustomers.map((c) => c.id);
    if (!ids.length) return;
    if (allSelected) setSelectedIds((cur) => cur.filter((id) => !ids.includes(id)));
    else setSelectedIds((cur) => Array.from(new Set([...cur, ...ids])));
  }, [allSelected, filteredCustomers]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds((cur) => cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id]);
  }, []);

  const filteredBranchesForm = useMemo(() => {
    if (!formData.company_id || !branches) return [];
    const cid = Number.parseInt(String(formData.company_id), 10);
    return Number.isNaN(cid) ? [] : branches.filter((b) => b.company_id === cid);
  }, [formData.company_id, branches]);

  const filteredBranchesFilter = useMemo(() => {
    if (filterCompany !== 'all' && branches) {
      const cid = Number.parseInt(filterCompany, 10);
      if (!Number.isNaN(cid)) return branches.filter((b) => b.company_id === cid);
    }
    return branches ?? [];
  }, [filterCompany, branches]);

  const handleViewCustomer = useCallback(async (customer: Customer) => {
    const reqId = ++detailRequestRef.current;
    setViewingCustomer(customer);
    setDetailTab('overview');
    setCustomerInvoices([]); setCustomerPayments([]); setCustomerOrders([]);
    setDetailLoading(true);
    try {
      const [invRes, payRes, ordRes] = await Promise.allSettled([
        apiClient.request('GET', `/invoices?customer_id=${customer.id}&per_page=${RELATED_LIMIT}`),
        apiClient.request('GET', `/payments?customer_id=${customer.id}&per_page=${RELATED_LIMIT}`),
        apiClient.request('GET', `/orders?customer_id=${customer.id}&per_page=${RELATED_LIMIT}`),
      ]);
      if (reqId !== detailRequestRef.current) return;

      if (invRes.status === 'fulfilled') {
        const raw = unwrapList<InvoiceSummaryRow>(invRes.value) as unknown as Record<string, unknown>[];
        setCustomerInvoices(filterByOwnership(raw, customer.id) as unknown as InvoiceSummaryRow[]);
      }
      if (payRes.status === 'fulfilled') {
        const raw = unwrapList<PaymentRow>(payRes.value) as unknown as Record<string, unknown>[];
        setCustomerPayments(filterByOwnership(raw, customer.id) as unknown as PaymentRow[]);
      }
      if (ordRes.status === 'fulfilled') {
        const raw = unwrapList<OrderSummaryRow>(ordRes.value) as unknown as Record<string, unknown>[];
        setCustomerOrders(filterByOwnership(raw, customer.id) as unknown as OrderSummaryRow[]);
      }
    } finally {
      if (reqId === detailRequestRef.current) setDetailLoading(false);
    }
  }, []);

  const closeDetailView = useCallback(() => {
    detailRequestRef.current += 1;
    setViewingCustomer(null);
  }, []);

  const activityEntries = useMemo<ActivityEntry[]>(() => {
    const out: ActivityEntry[] = [];
    customerInvoices.forEach((inv) => out.push({
      id: `inv-${inv.id}`, type: 'invoice',
      title: `Invoice ${inv.invoice_no ?? `#${inv.id}`}`,
      subtitle: inv.payment_status || inv.status || 'Invoice',
      amount: safeNum(inv.total_amount),
      date: (inv.invoice_date as string) || '',
      status: (inv.status as string) || undefined,
    }));
    customerPayments.forEach((pay) => out.push({
      id: `pay-${pay.id}`, type: 'payment',
      title: `Payment ${pay.reference_no ?? `#${pay.id}`}`,
      subtitle: `${pay.payment_direction ?? 'inward'} · ${pay.payment_method ?? '—'}`,
      amount: safeNum(pay.amount),
      date: (pay.transaction_date as string) || '',
      status: (pay.status as string) || undefined,
    }));
    customerOrders.forEach((ord) => out.push({
      id: `ord-${ord.id}`, type: 'order',
      title: `Order ${ord.order_no ?? `#${ord.id}`}`,
      subtitle: `${ord.source ?? 'order'} · ${ord.status ?? '—'}`,
      amount: safeNum(ord.total_amount),
      date: (ord.created_at as string) || (ord.delivery_date as string) || '',
      status: (ord.status as string) || undefined,
    }));
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
  }, [customerInvoices, customerPayments, customerOrders]);

  const handleGstChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((p) => ({ ...p, gst_number: e.target.value.toUpperCase().replace(/\s+/g, '') }));
  }, []);

  const handleAutoFill = useCallback(async () => {
    const gst = formData.gst_number.trim();
    if (!gst || gst.length < 10) {
      showError('Invalid GSTIN', 'Please enter a valid GSTIN (min 10 characters).');
      return;
    }
    setLookingUp(true);
    try {
      const data = (await apiClient.lookupGst(gst)) as GstLookupResult | null;
      if (data) {
        setFormData((p) => ({
          ...p,
          name: data.company_name || p.name,
          billing_street: data.billing_street || p.billing_street,
          billing_city: data.billing_city || p.billing_city,
          billing_state: data.billing_state || p.billing_state,
          billing_pincode: data.billing_pincode || p.billing_pincode,
          billing_country: data.billing_country || p.billing_country,
          registration_type: data.registration_type || p.registration_type,
          pan: data.pan || p.pan,
        }));
        showSuccess('GSTIN details auto-filled');
      } else {
        showError('Not found', 'Unable to fetch GSTIN details. Check the number and try again.');
      }
    } catch (err) {
      showError('Lookup failed', getErrorMessage(err, 'Unable to fetch GSTIN details.'));
    } finally {
      setLookingUp(false);
    }
  }, [formData.gst_number, showSuccess, showError]);

  const handleSameAsBillingToggle = useCallback((checked: boolean) => {
    setFormData((p) => ({
      ...p, same_as_billing: checked,
      ...(checked ? {
        shipping_street: p.billing_street, shipping_landmark: p.billing_landmark,
        shipping_city: p.billing_city, shipping_state: p.billing_state,
        shipping_country: p.billing_country, shipping_pincode: p.billing_pincode,
      } : {}),
    }));
  }, []);

  const handleFieldChange = useCallback((field: string, value: string) => {
    setFormData((p) => ({ ...p, [field]: value } as CustomerFormData));
  }, []);

  const handleAddGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setAddingGroup(true);
    try {
      await apiClient.createCustomerGroup({ name });
      refreshGroups();
      showSuccess('Group added', `${name} created.`);
      setNewGroupName('');
      setShowGroupModal(false);
    } catch (err) {
      showError('Failed to add group', getErrorMessage(err, 'Failed to add group.'));
    } finally {
      setAddingGroup(false);
    }
  }, [newGroupName, refreshGroups, showSuccess, showError]);

  const handleBulkDelete = useCallback(async () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Delete ${selectedIds.length} customer(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.deleteCustomer(id)));
      showSuccess('Bulk delete', `${selectedIds.length} deleted.`);
      safeLog({ module: 'Customers', action: 'Bulk delete', status: 'success', message: `Deleted ${selectedIds.length}` });
      setSelectedIds([]);
      refreshCustomers();
    } catch (err) {
      showError('Bulk delete failed', getErrorMessage(err, 'Bulk delete failed.'));
    }
  }, [selectedIds, refreshCustomers, showSuccess, showError]);

  const handleBulkTypeChange = useCallback(async (type: CustomerType) => {
    if (!selectedIds.length) return;
    if (!window.confirm(`Change type to "${type}" for ${selectedIds.length} record(s)?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.updateCustomer(id, { type })));
      showSuccess('Bulk update', `Type changed for ${selectedIds.length} record(s).`);
      safeLog({ module: 'Customers', action: 'Bulk type change', status: 'success', message: `Changed to ${type}` });
      setSelectedIds([]);
      refreshCustomers();
    } catch (err) {
      showError('Bulk update failed', getErrorMessage(err, 'Bulk update failed.'));
    }
  }, [selectedIds, refreshCustomers, showSuccess, showError]);

  const handleCreate = useCallback(() => {
    setEditingId(null);
    setFormData(createEmptyForm());
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleEdit = useCallback((customer: Customer) => {
    setEditingId(customer.id);
    const sameShip =
      (customer.shipping_street ?? '') === (customer.billing_street ?? '') &&
      (customer.shipping_city ?? '') === (customer.billing_city ?? '') &&
      (customer.shipping_state ?? '') === (customer.billing_state ?? '') &&
      (customer.shipping_pincode ?? '') === (customer.billing_pincode ?? '') &&
      (customer.shipping_country ?? '') === (customer.billing_country ?? '');

    setFormData({
      name: customer.name || '', type: customer.type || 'customer',
      company_type: customer.company_type || '',
      email: customer.email || '', contact_person: customer.contact_person || '',
      contact_no: customer.contact_no || '', gst_number: customer.gst_number || '',
      registration_type: customer.registration_type || '', pan: customer.pan || '',
      billing_street: customer.billing_street || '', billing_landmark: customer.billing_landmark || '',
      billing_city: customer.billing_city || '', billing_state: customer.billing_state || '',
      billing_country: customer.billing_country || 'India', billing_pincode: customer.billing_pincode || '',
      shipping_street: customer.shipping_street || '', shipping_landmark: customer.shipping_landmark || '',
      shipping_city: customer.shipping_city || '', shipping_state: customer.shipping_state || '',
      shipping_country: customer.shipping_country || 'India', shipping_pincode: customer.shipping_pincode || '',
      eway_bill_distance: customer.eway_bill_distance ?? '',
      group_id: customer.group_id ?? '',
      opening_balance: customer.opening_balance ?? '',
      credit_limit: customer.credit_limit ?? '',
      due_days: customer.due_days ?? '',
      outstanding_amount: customer.computed_outstanding ?? customer.outstanding_amount ?? '',
      fax: customer.fax || '', website: customer.website || '',
      note: customer.note || '', license_no: customer.license_no || '',
      custom_field_1: customer.custom_field_1 || '', custom_field_2: customer.custom_field_2 || '',
      is_active: customer.is_active !== false,
      company_id: customer.company_id ?? '', branch_id: customer.branch_id ?? '',
      same_as_billing: sameShip,
    });
    setFormErrors({});
    setIsPanelOpen(true);
  }, []);

  const handleLedger = useCallback((customer: Customer) => {
    navigate(`/customers/${customer.id}/ledger`);
  }, [navigate]);

  const handleLedgerA4 = useCallback(async (customer: Customer) => {
    setLedgerLoadingId(customer.id);
    try {
      const { entries, summary: serverSummary } = await fetchLedger(customer.id);
      const html = buildLedgerHtml(customer, entries, serverSummary);
      printLedgerHtml(html);
      showSuccess('Ledger ready', `A4 statement prepared for ${customer.name}.`);
      safeLog({ module: 'Customers', action: 'Ledger A4', status: 'success', message: `Generated for ${customer.name}` });
    } catch (err) {
      showError('Ledger failed', getErrorMessage(err, 'Unable to prepare ledger. Please try again.'));
      safeLog({ module: 'Customers', action: 'Ledger A4', status: 'error', message: getErrorMessage(err, 'Ledger failed') });
    } finally {
      setLedgerLoadingId(null);
    }
  }, [showSuccess, showError]);

  const handleDelete = useCallback(async (customer: Customer) => {
    if (!window.confirm(`Delete "${customer.name}"?`)) return;
    try {
      await apiClient.deleteCustomer(customer.id);
      showSuccess('Deleted', `${customer.name} removed.`);
      safeLog({ module: 'Customers', action: 'Delete', status: 'success', message: `Deleted ${customer.name}` });
      refreshCustomers();
    } catch (err) {
      showError('Delete failed', getErrorMessage(err, 'Delete failed.'));
    }
  }, [refreshCustomers, showSuccess, showError]);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, boolean> = {};
    let valid = true;
    if (!formData.name.trim()) { errors.name = true; valid = false; }
    if (!formData.billing_city.trim()) { errors.billing_city = true; valid = false; }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = true; valid = false;
    }
    if (formData.contact_no.trim() && !/^\d+$/.test(formData.contact_no.trim())) {
      errors.contact_no = true; valid = false;
    }
    setFormErrors(errors);
    if (!valid) showError('Validation', 'Please fix the highlighted required fields.');
    return valid;
  }, [formData, showError]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    const { same_as_billing: _x, ...rest } = formData;
    const payload = {
      ...rest,
      name: formData.name.trim(),
      email: formData.email.trim(),
      contact_no: formData.contact_no.trim(),
      company_id: formData.company_id ? Number(formData.company_id) : null,
      branch_id: formData.branch_id ? Number(formData.branch_id) : null,
      group_id: formData.group_id ? Number(formData.group_id) : null,
      eway_bill_distance: formData.eway_bill_distance ? Number(formData.eway_bill_distance) : null,
      opening_balance: formData.opening_balance ? Number(formData.opening_balance) : 0,
      credit_limit: formData.credit_limit ? Number(formData.credit_limit) : null,
      due_days: formData.due_days ? Number(formData.due_days) : null,
      outstanding_amount: formData.outstanding_amount ? Number(formData.outstanding_amount) : 0,
    };
    setSubmitting(true);
    try {
      if (editingId) {
        await apiClient.updateCustomer(editingId, payload);
        showSuccess('Updated', `${formData.name} updated.`);
        safeLog({ module: 'Customers', action: 'Update', status: 'success', message: formData.name });
      } else {
        await apiClient.createCustomer(payload);
        showSuccess('Created', `${formData.name} created.`);
        safeLog({ module: 'Customers', action: 'Create', status: 'success', message: formData.name });
      }
      setIsPanelOpen(false);
      refreshCustomers();
    } catch (err) {
      showError('Save failed', getErrorMessage(err, 'Save failed.'));
      safeLog({ module: 'Customers', action: 'Save', status: 'error', message: getErrorMessage(err, 'Save failed') });
    } finally {
      setSubmitting(false);
    }
  }, [formData, editingId, refreshCustomers, showSuccess, showError, validateForm]);

  const handleExport = useCallback(() => {
    if (!filteredCustomers.length) {
      showError('Export failed', 'No customers to export.');
      return;
    }
    const headers = ['ID', 'Name', 'Type', 'Email', 'Contact No', 'Company', 'Branch', 'GST', 'City', 'State', 'Outstanding'];
    const rows = filteredCustomers.map((c) =>
      [
        c.id, escapeCsvField(c.name), escapeCsvField(c.type),
        escapeCsvField(c.email || ''), escapeCsvField(c.contact_no || ''),
        escapeCsvField(c.company?.name || ''), escapeCsvField(c.branch?.name || ''),
        escapeCsvField(c.gst_number || ''), escapeCsvField(c.billing_city || ''),
        escapeCsvField(c.billing_state || ''), getOutstanding(c).toFixed(2),
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showSuccess('Export', 'Data exported.');
  }, [filteredCustomers, showSuccess, showError]);

  const handleImportOpen = useCallback(() => {
    setIsImportOpen(true);
    setImportStep('select');
    setImportFile(null);
    setImportPreview([]);
    setImportSummary(null);
    setImportErrors([]);
    setImportResultMessage('');
    setImportSuccess(false);
    setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePreview = useCallback(async (file: File) => {
    setImportLoading(true);
    try {
      const response = await apiClient.importCustomers(file, duplicateAction, true);
      setImportPreview(response.preview || []);
      setImportSummary({ total: response.total ?? 0, valid: response.valid ?? 0, invalid: response.invalid ?? 0 });
      setImportErrors(response.errors || []);
      setImportStep('preview');
    } catch (err) {
      showError('Preview failed', getErrorMessage(err, 'Preview failed.'));
      setImportStep('select');
    } finally {
      setImportLoading(false);
    }
  }, [duplicateAction, showError]);

  const handleFileChange = useCallback((file: File | null) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const okTypes = ['text/csv', 'application/vnd.ms-excel', 'application/octet-stream'];
    if (!okTypes.includes(file.type) && ext !== 'csv') { showError('Invalid file', 'Please select a CSV file.'); return; }
    if (file.size > MAX_IMPORT_FILE_BYTES) { showError('File too large', 'Maximum size is 10MB.'); return; }
    setImportFile(file);
    void handlePreview(file);
  }, [handlePreview, showError]);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files.length) handleFileChange(e.dataTransfer.files[0]);
  }, [handleFileChange]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(false); }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const response = await apiClient.importCustomers(importFile, duplicateAction, false);
      const sum: ImportSummary = response.summary ?? { total: 0, valid: 0, invalid: 0 };
      setImportSummary(sum);
      setImportErrors(response.errors || []);
      setImportResultMessage(response.message || '');
      setImportSuccess(Boolean(response.success));
      setImportStep('result');
      if (response.success) {
        showSuccess('Import completed', response.message || 'Import completed.');
        refreshCustomers();
        safeLog({ module: 'Customers', action: 'Import', status: 'success', message: `${sum.created ?? 0} created` });
      } else {
        showError('Import failed', response.message || 'Please check errors.');
        safeLog({ module: 'Customers', action: 'Import', status: 'error', message: response.message || 'Import failed' });
      }
    } catch (err) {
      showError('Import failed', getErrorMessage(err, 'Import failed.'));
      setImportStep('preview');
      safeLog({ module: 'Customers', action: 'Import', status: 'error', message: getErrorMessage(err, 'Import failed') });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, duplicateAction, refreshCustomers, showSuccess, showError]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const blob = await apiClient.downloadCustomerTemplate();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'customers_template.csv';
      document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
      showSuccess('Template downloaded', 'Ready for import.');
    } catch (err) {
      showError('Template download failed', getErrorMessage(err, 'Download failed.'));
    }
  }, [showSuccess, showError]);

  const handleDownloadErrorReport = useCallback(() => {
    if (!importErrors.length) return;
    const headers = ['Row', 'Field', 'Error'];
    const rows = importErrors.map((e) => [e.row, escapeCsvField(e.field), escapeCsvField(e.message)].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'customer_import_errors.csv';
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }, [importErrors]);

  const toggleOutstandingVisibility = useCallback((id: number) => {
    setOutstandingVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (custError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertCircle size={24} />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Failed to load customers</h2>
          <p className="mt-1.5 text-sm text-slate-500">{custError}</p>
          <Button onClick={() => refreshCustomers()} className="mt-5 rounded-xl bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .customers-offcanvas-wide { width: min(1080px, 96vw) !important; max-width: min(1080px, 96vw) !important; }
        .customers-detail-offcanvas { width: min(760px, 96vw) !important; max-width: min(760px, 96vw) !important; }
        @media (max-width: 640px) {
          .customers-offcanvas-wide, .customers-detail-offcanvas { width: 100vw !important; max-width: 100vw !important; }
        }
        .customers-offcanvas-wide .customers-form-scroll,
        .customers-detail-offcanvas .customers-form-scroll {
          overflow-y: auto; overflow-x: hidden; min-height: 0; flex: 1 1 auto;
          max-height: calc(100vh - 180px); scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent;
        }
        .customers-offcanvas-wide .customers-form-scroll::-webkit-scrollbar,
        .customers-detail-offcanvas .customers-form-scroll::-webkit-scrollbar { width: 8px; }
        .customers-offcanvas-wide .customers-form-scroll::-webkit-scrollbar-thumb,
        .customers-detail-offcanvas .customers-form-scroll::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 8px; }
        .customers-offcanvas-wide .customers-form-scroll::-webkit-scrollbar-thumb:hover,
        .customers-detail-offcanvas .customers-form-scroll::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
      `}</style>

      <div className="min-h-full bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/60">
        <div className="mx-auto w-full max-w-[1900px] space-y-5 p-3 sm:p-4 lg:space-y-6 lg:p-6">
          {/* Hero */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-800/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.45)] sm:px-7 lg:px-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />

            <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200 backdrop-blur">
                  <FiUsers size={12} /> CRM · Customers
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[32px]">
                  Customer directory
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm text-slate-300">
                  Manage customers, dealers, and distributors — with GST, addresses, and credit limits.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={handleImportOpen}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <FiUpload className="mr-2" size={14} /> Import
                </Button>
                <Button type="button" variant="outline" onClick={handleExport}
                  disabled={custLoading || !filteredCustomers.length}
                  className="h-10 rounded-xl border-white/10 bg-white/5 text-white shadow-none backdrop-blur transition hover:border-white/20 hover:bg-white/10 hover:text-white">
                  <FiDownload className="mr-2" size={14} /> Export
                </Button>
                <Button type="button" onClick={handleCreate}
                  className="h-10 rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-400 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:from-cyan-200 hover:to-cyan-300">
                  <FiPlus className="mr-2" size={14} /> Add customer
                </Button>
              </div>
            </div>

            <div className="relative mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Total outstanding</p>
                <p className="mt-1 text-sm font-bold text-rose-300">
                  {custLoading ? '…' : formatCurrency(summary.totalOutstanding)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">From customers</p>
                <p className="mt-1 text-sm font-bold text-emerald-300">
                  {custLoading ? '…' : formatCurrency(summary.outstandingCustomers)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">From dealers</p>
                <p className="mt-1 text-sm font-bold text-violet-300">
                  {custLoading ? '…' : formatCurrency(summary.outstandingDealers)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">From distributors</p>
                <p className="mt-1 text-sm font-bold text-teal-300">
                  {custLoading ? '…' : formatCurrency(summary.outstandingDistributors)}
                </p>
              </div>
            </div>
          </section>

          {/* KPI — counts */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {customers ? (
              <>
                <StatCard icon={FiUsers} label="Total" value={summary.total} accent="indigo" />
                <StatCard icon={FiShoppingBag} label="Customers" value={summary.customersCount} accent="emerald" />
                <StatCard icon={FiTruck} label="Dealers" value={summary.dealers} accent="violet" />
                <StatCard icon={FiPackage} label="Distributors" value={summary.distributors} accent="teal" />
              </>
            ) : Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
          </section>

          {/* KPI — outstanding */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {customers ? (
              <>
                <StatCard icon={FiDollarSign} label="Total outstanding" value={formatCurrency(summary.totalOutstanding)} accent="rose" />
                <StatCard icon={FiShoppingBag} label="Customer dues" value={formatCurrency(summary.outstandingCustomers)} accent="amber" />
                <StatCard icon={FiTruck} label="Dealer dues" value={formatCurrency(summary.outstandingDealers)} accent="violet" />
                <StatCard icon={FiPackage} label="Distributor dues" value={formatCurrency(summary.outstandingDistributors)} accent="sky" />
              </>
            ) : Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={`o-${i}`} />)}
          </section>

          {/* Filters */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                  <FiFilter size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Filters</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {activeFilterCount > 0
                      ? `${activeFilterCount} active filter${activeFilterCount > 1 ? 's' : ''}`
                      : 'Refine by type, company, or branch'}
                  </CardDescription>
                </div>
              </div>
              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" size="sm"
                  className="h-9 rounded-lg text-slate-500 hover:text-slate-800" onClick={clearFilters}>
                  <FiX className="mr-1.5" size={14} /> Reset
                </Button>
              )}
            </CardHeader>
            <CardContent className="bg-white p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <select aria-label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                    {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
                <div className="relative">
                  <select aria-label="Company" value={filterCompany}
                    onChange={(e) => { setFilterCompany(e.target.value); setFilterBranch('all'); }}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                    <option value="all">All companies</option>
                    {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
                <div className="relative">
                  <select aria-label="Branch" value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                    <option value="all">All branches</option>
                    {filteredBranchesFilter.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk toolbar */}
          {selectedIds.length > 0 && (
            <div className="sticky top-3 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-lg shadow-slate-900/5 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
                <div className="mr-1 flex items-center gap-2 rounded-lg bg-indigo-50 px-2.5 py-1 text-indigo-700 ring-1 ring-indigo-500/10">
                  <span className="text-sm font-bold">{selectedIds.length}</span>
                  <span className="text-xs font-medium">selected</span>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkTypeChange('customer')}>
                  <FiShoppingBag className="mr-1.5 text-emerald-600" size={14} /> Set customer
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkTypeChange('dealer')}>
                  <FiTruck className="mr-1.5 text-violet-600" size={14} /> Set dealer
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => handleBulkTypeChange('distributor')}>
                  <FiPackage className="mr-1.5 text-teal-600" size={14} /> Set distributor
                </Button>
                <Button type="button" size="sm"
                  className="h-9 rounded-lg border border-red-600 bg-red-600 font-semibold text-white shadow-none hover:border-red-700 hover:bg-red-700"
                  onClick={handleBulkDelete}>
                  <FiTrash2 className="mr-1.5" size={14} /> Delete
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  className="ml-auto h-9 rounded-lg text-slate-500 hover:text-slate-800" onClick={() => setSelectedIds([])}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FiUsers size={14} />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold text-slate-800">Customer list</CardTitle>
                  <CardDescription className="text-[11px] text-slate-500">
                    {custLoading
                      ? 'Loading customers…'
                      : `${filteredCustomers.length.toLocaleString('en-IN')} record${filteredCustomers.length === 1 ? '' : 's'} · Click a row to view details`}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <Table className="min-w-[1180px]">
                <TableHeader>
                  <TableRow className="border-slate-100 bg-slate-50/70 hover:bg-slate-50/70">
                    <TableHead className="w-11 px-3">
                      <input aria-label="Select all" type="checkbox" checked={allSelected}
                        onChange={(e) => { e.stopPropagation(); toggleSelectAll(); }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                    </TableHead>
                    <TableHead className="w-16"><TableHeadLabel>ID</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Name</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Type</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Contact</TableHeadLabel></TableHead>
                    <TableHead className="text-right"><TableHeadLabel align="right">Outstanding</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>Company</TableHeadLabel></TableHead>
                    <TableHead><TableHeadLabel>City</TableHeadLabel></TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {custLoading && Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`} className="border-slate-100">
                      {Array.from({ length: TABLE_COLUMN_COUNT }).map((__, ci) => (
                        <TableCell key={ci}><div className="h-4 animate-pulse rounded bg-slate-100" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                  {!custLoading && filteredCustomers.map((customer) => {
                    const selected = selectedIds.includes(customer.id);
                    const typeColors: Record<CustomerType, string> = {
                      customer: 'border-emerald-200/70 bg-emerald-50 text-emerald-700',
                      dealer: 'border-violet-200/70 bg-violet-50 text-violet-700',
                      distributor: 'border-teal-200/70 bg-teal-50 text-teal-700',
                    };
                    const isVisible = outstandingVisibleIds.has(customer.id);
                    const amount = getOutstanding(customer);
                    const isLedgerLoading = ledgerLoadingId === customer.id;

                    return (
                      <TableRow key={customer.id}
                        data-state={selected ? 'selected' : undefined}
                        className={`cursor-pointer border-slate-100 transition-colors hover:bg-slate-50/70 ${selected ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : ''}`}
                        onClick={() => handleViewCustomer(customer)}>
                        <TableCell className="px-3" onClick={(e) => e.stopPropagation()}>
                          <input aria-label={`Select ${customer.name}`} type="checkbox" checked={selected}
                            onChange={(e) => { e.stopPropagation(); toggleSelected(customer.id); }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
                        </TableCell>
                        <TableCell><span className="font-mono text-[12px] text-slate-500">#{customer.id}</span></TableCell>
                        <TableCell>
                          <div className="flex min-w-[200px] items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-[11px] font-bold text-white">
                              {(customer.name || 'C')[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                              {customer.gst_number && (
                                <p className="truncate text-[11px] text-slate-500">{customer.gst_number}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${typeColors[customer.type] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {customer.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="min-w-[190px]">
                            {customer.email && <p className="truncate text-sm text-slate-700">{customer.email}</p>}
                            {customer.contact_no && <p className="truncate text-[11px] text-slate-500">{customer.contact_no}</p>}
                            {!customer.email && !customer.contact_no && <span className="text-sm text-slate-400">—</span>}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-lg px-2 py-1 text-sm font-semibold tabular-nums ${amount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {isVisible ? formatCurrency(amount) : '•••••'}
                            </span>
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); toggleOutstandingVisibility(customer.id); }}
                              className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                              title={isVisible ? 'Hide amount' : 'Show amount'}
                              aria-label={isVisible ? 'Hide amount' : 'Show amount'}>
                              {isVisible ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell><span className="text-sm text-slate-700">{customer.company?.name || '—'}</span></TableCell>
                        <TableCell><span className="text-sm text-slate-700">{customer.billing_city || '—'}</span></TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <ActionDropdown customer={customer} onEdit={handleEdit}
                            onLedger={handleLedger} onLedgerA4={handleLedgerA4}
                            onDelete={handleDelete} ledgerLoading={isLedgerLoading} />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!custLoading && !filteredCustomers.length && (
                    <TableRow>
                      <TableCell colSpan={TABLE_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto max-w-md px-4">
                          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 ring-1 ring-slate-200/70">
                            <FiFilter className="h-6 w-6 text-slate-400" />
                          </div>
                          <p className="mt-4 text-base font-semibold text-slate-800">No customers found</p>
                          <p className="mt-1 text-sm text-slate-500">Try adjusting the type, company, or branch filter.</p>
                          <Button type="button" className="mt-5 rounded-lg" variant="outline" onClick={clearFilters}>
                            <FiFilter className="mr-2" size={14} /> Reset filters
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </div>

      {/* Detail offcanvas */}
      {viewingCustomer && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading…</div>
          </div>
        }>
          <Offcanvas isOpen={!!viewingCustomer} title={viewingCustomer.name}
            onClose={closeDetailView} className="customers-detail-offcanvas"
            footer={
              <div className="flex w-full flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" onClick={closeDetailView} className="rounded-xl">
                  <FiX className="mr-2" size={14} /> Close
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => handleLedger(viewingCustomer)} className="rounded-xl text-emerald-600">
                    <FiBookOpen className="mr-2" size={14} /> Ledger
                  </Button>
                  <Button type="button" variant="outline"
                    disabled={ledgerLoadingId === viewingCustomer.id}
                    onClick={() => handleLedgerA4(viewingCustomer)}
                    className="rounded-xl text-sky-600">
                    <FiPrinter className="mr-2" size={14} />
                    {ledgerLoadingId === viewingCustomer.id ? 'Preparing…' : 'Download A4'}
                  </Button>
                  <Button type="button"
                    onClick={() => { const t = viewingCustomer; closeDetailView(); handleEdit(t); }}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                    <FiEdit className="mr-2" size={14} /> Edit
                  </Button>
                </div>
              </div>
            }>
            <div className="customers-form-scroll space-y-5 pr-2">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm">
                    {(viewingCustomer.name || 'C')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">{viewingCustomer.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                          viewingCustomer.type === 'dealer'
                            ? 'border-violet-200/70 bg-violet-50 text-violet-700'
                            : viewingCustomer.type === 'distributor'
                              ? 'border-teal-200/70 bg-teal-50 text-teal-700'
                              : 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                        }`}>
                        {viewingCustomer.type}
                      </Badge>
                      <Badge variant="outline"
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                          viewingCustomer.is_active
                            ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}>
                        {viewingCustomer.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <span className="font-mono text-[11px] text-slate-400">#{viewingCustomer.id}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Outstanding</p>
                  <p className={`mt-1 text-sm font-bold tabular-nums ${getOutstanding(viewingCustomer) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatCurrency(getOutstanding(viewingCustomer))}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Credit limit</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(viewingCustomer.credit_limit)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Opening</p>
                  <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(viewingCustomer.opening_balance)}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                {([
                  { key: 'overview', label: 'Overview', icon: FiUsers },
                  { key: 'invoices', label: 'Invoices', icon: FiFileText },
                  { key: 'payments', label: 'Payments', icon: FiCreditCard },
                  { key: 'orders', label: 'Orders', icon: FiShoppingBag },
                  { key: 'activity', label: 'Activity', icon: FiActivity },
                ] as const).map((tab) => {
                  const Icon = tab.icon;
                  const active = detailTab === tab.key;
                  return (
                    <button key={tab.key} type="button" onClick={() => setDetailTab(tab.key)}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition ${active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>
                      <Icon size={13} /> {tab.label}
                    </button>
                  );
                })}
              </div>

              {detailTab === 'overview' && (
                <div className="space-y-4">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="border-b border-slate-100 px-3.5 py-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contact</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {[
                        { icon: FiMail, label: 'Email', value: viewingCustomer.email },
                        { icon: FiPhone, label: 'Phone', value: viewingCustomer.contact_no },
                        { icon: FiUsers, label: 'Contact person', value: viewingCustomer.contact_person },
                        { icon: null, label: 'GSTIN', value: viewingCustomer.gst_number, mono: true },
                        { icon: null, label: 'PAN', value: viewingCustomer.pan, mono: true },
                      ].map((row) => {
                        const Icon = row.icon;
                        return (
                          <div key={row.label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                              {Icon ? <Icon size={12} /> : null}{row.label}
                            </span>
                            <span className={`min-w-0 truncate text-xs font-semibold text-slate-800 ${row.mono ? 'font-mono' : ''}`}>
                              {row.value || '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {(viewingCustomer.billing_city || viewingCustomer.billing_street) && (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-3.5 py-2.5">
                        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <FiMapPin size={12} /> Billing address
                        </p>
                      </div>
                      <div className="px-3.5 py-3 text-xs text-slate-700">
                        {viewingCustomer.billing_street && <p className="whitespace-pre-line">{viewingCustomer.billing_street}</p>}
                        <p className="mt-1 text-slate-600">
                          {[viewingCustomer.billing_city, viewingCustomer.billing_state, viewingCustomer.billing_pincode].filter(Boolean).join(', ') || '—'}
                        </p>
                        <p className="text-slate-500">{viewingCustomer.billing_country || ''}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700/80">Invoices</p>
                      <p className="mt-1 text-lg font-bold text-indigo-700">{detailLoading ? '…' : customerInvoices.length}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80">Payments</p>
                      <p className="mt-1 text-lg font-bold text-emerald-700">{detailLoading ? '…' : customerPayments.length}</p>
                    </div>
                    <div className="rounded-xl border border-violet-200/70 bg-violet-50/60 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/80">Orders</p>
                      <p className="mt-1 text-lg font-bold text-violet-700">{detailLoading ? '…' : customerOrders.length}</p>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'invoices' && (
                <div className="space-y-2">
                  {detailLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                  )) : customerInvoices.length === 0 ? (
                    <EmptyTab icon={FiFileText} title="No invoices yet" subtitle="This customer hasn't been invoiced." />
                  ) : customerInvoices.map((inv) => (
                    <button key={inv.id} type="button" onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                        <FiFileText size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{inv.invoice_no ?? `#${inv.id}`}</p>
                        <p className="text-[11px] text-slate-500">{formatDate(inv.invoice_date)} · {inv.payment_status || '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(inv.total_amount)}</p>
                        <div className="mt-0.5 flex justify-end"><StatusPill status={inv.status} /></div>
                      </div>
                      <FiExternalLink className="shrink-0 text-slate-300" size={14} />
                    </button>
                  ))}
                </div>
              )}

              {detailTab === 'payments' && (
                <div className="space-y-2">
                  {detailLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                  )) : customerPayments.length === 0 ? (
                    <EmptyTab icon={FiCreditCard} title="No payments yet" subtitle="No payment records for this customer." />
                  ) : customerPayments.map((pay) => {
                    const inward = String(pay.payment_direction ?? 'inward').toLowerCase() === 'inward';
                    return (
                      <div key={pay.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${inward ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                          <FiCreditCard size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{pay.reference_no ?? `#${pay.id}`}</p>
                          <p className="text-[11px] text-slate-500">
                            {formatDate(pay.transaction_date)} · {pay.payment_method ?? '—'} · {inward ? 'Inward' : 'Outward'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-semibold tabular-nums ${inward ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {inward ? '+' : '−'}{formatCurrency(pay.amount)}
                          </p>
                          <div className="mt-0.5 flex justify-end"><StatusPill status={pay.status} /></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {detailTab === 'orders' && (
                <div className="space-y-2">
                  {detailLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                  )) : customerOrders.length === 0 ? (
                    <EmptyTab icon={FiShoppingBag} title="No orders yet" subtitle="This customer hasn't placed any orders." />
                  ) : customerOrders.map((ord) => (
                    <button key={ord.id} type="button" onClick={() => navigate(`/orders/${ord.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 hover:bg-violet-50/40">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600">
                        <FiShoppingBag size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{ord.order_no ?? `#${ord.id}`}</p>
                        <p className="text-[11px] text-slate-500">{formatDate(ord.created_at || ord.delivery_date)} · {ord.source ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(ord.total_amount)}</p>
                        <div className="mt-0.5 flex justify-end"><StatusPill status={ord.status} /></div>
                      </div>
                      <FiExternalLink className="shrink-0 text-slate-300" size={14} />
                    </button>
                  ))}
                </div>
              )}

              {detailTab === 'activity' && (
                <div className="space-y-2">
                  {detailLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                  )) : activityEntries.length === 0 ? (
                    <EmptyTab icon={FiActivity} title="No recent activity" subtitle="Nothing has happened with this customer yet." />
                  ) : (
                    <div className="relative pl-6">
                      <div className="absolute bottom-2 left-2.5 top-2 w-px bg-slate-200" />
                      {activityEntries.map((entry) => {
                        const map = {
                          invoice: { icon: FiFileText, cls: 'bg-indigo-50 text-indigo-600' },
                          payment: { icon: FiCreditCard, cls: 'bg-emerald-50 text-emerald-600' },
                          order: { icon: FiShoppingBag, cls: 'bg-violet-50 text-violet-600' },
                        };
                        const { icon: Icon, cls } = map[entry.type];
                        return (
                          <div key={entry.id} className="relative mb-2 pl-3">
                            <div className={`absolute -left-[17px] top-2 grid h-6 w-6 place-items-center rounded-full ring-4 ring-white ${cls}`}>
                              <Icon size={11} />
                            </div>
                            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-slate-900">{entry.title}</p>
                                <p className="flex items-center gap-1 text-[11px] text-slate-500">
                                  <FiCalendar size={10} /> {formatDate(entry.date)} · {entry.subtitle}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(entry.amount)}</p>
                                {entry.status && <div className="mt-0.5 flex justify-end"><StatusPill status={entry.status} /></div>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Form offcanvas */}
      {isPanelOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading form…</div>
          </div>
        }>
          <Offcanvas isOpen={isPanelOpen} title={editingId ? 'Edit customer' : 'Add customer'}
            onClose={() => setIsPanelOpen(false)} className="customers-offcanvas-wide"
            footer={
              <div className="flex w-full justify-between">
                <Button type="button" variant="outline" onClick={() => setIsPanelOpen(false)}
                  disabled={submitting} className="rounded-xl">
                  <FiX className="mr-2" size={14} /> Cancel
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={submitting}
                  className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                  {submitting ? 'Saving…' : editingId ? 'Update customer' : 'Save customer'}
                </Button>
              </div>
            }>
            <div className="customers-form-scroll space-y-5 pr-2">
              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Customer / vendor detail
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Type</label>
                      <div className="relative">
                        <select value={formData.type}
                          onChange={(e) => setFormData((p) => ({ ...p, type: e.target.value as CustomerType }))}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="customer">Customer</option>
                          <option value="dealer">Dealer</option>
                          <option value="distributor">Distributor</option>
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Company <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <select value={formData.company_id as string}
                          onChange={(e) => setFormData((p) => ({ ...p, company_id: e.target.value, branch_id: '' }))}
                          className={`h-10 w-full appearance-none rounded-xl border bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition ${
                            formErrors.company_id
                              ? 'border-rose-300 ring-2 ring-rose-200'
                              : 'border-slate-200 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                          }`}>
                          <option value="">Select company</option>
                          {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Branch</label>
                      <div className="relative">
                        <select value={formData.branch_id as string}
                          onChange={(e) => setFormData((p) => ({ ...p, branch_id: e.target.value }))}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="">Select branch</option>
                          {filteredBranchesForm.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">GSTIN</label>
                    <div className="flex gap-2">
                      <Input id="gst_number" type="text" value={formData.gst_number}
                        onChange={handleGstChange}
                        className="h-10 flex-1 rounded-xl border-slate-200 shadow-sm focus-visible:ring-4 focus-visible:ring-indigo-500/10"
                        placeholder="Enter GSTIN" maxLength={15} />
                      <Button type="button" onClick={handleAutoFill}
                        disabled={lookingUp || !formData.gst_number}
                        className="h-10 shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white hover:bg-slate-800">
                        {lookingUp ? 'Fetching…' : 'Auto fill'}
                      </Button>
                    </div>
                  </div>

                  <FormTextField label="Company name" field="name" required
                    value={formData.name} hasError={formErrors.name} onChange={handleFieldChange} />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormTextField label="Contact person" field="contact_person" value={formData.contact_person} onChange={handleFieldChange} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Contact no</label>
                      <input id="contact_no" type="tel" inputMode="numeric" value={formData.contact_no}
                        onChange={(e) => setFormData((p) => ({ ...p, contact_no: e.target.value.replace(/\D/g, '') }))}
                        className={`h-10 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm shadow-sm outline-none transition ${
                          formErrors.contact_no
                            ? 'border-rose-300 ring-2 ring-rose-200'
                            : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10'
                        }`}
                        placeholder="Enter contact no" maxLength={15} />
                    </div>
                    <FormTextField label="Email" field="email" type="email" value={formData.email} hasError={formErrors.email} onChange={handleFieldChange} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Registration details
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Registration type</label>
                    <div className="relative">
                      <select value={formData.registration_type}
                        onChange={(e) => setFormData((p) => ({ ...p, registration_type: e.target.value }))}
                        className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                        <option value="">Select</option>
                        <option value="Registered">Registered</option>
                        <option value="Unregistered">Unregistered</option>
                      </select>
                      <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    </div>
                  </div>
                  <FormTextField label="PAN" field="pan" value={formData.pan} onChange={handleFieldChange} />
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Billing address
                </legend>
                <div className="mt-3 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                    <textarea value={formData.billing_street}
                      onChange={(e) => setFormData((p) => ({ ...p, billing_street: e.target.value }))}
                      rows={2}
                      className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Enter address" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FormTextField label="City" field="billing_city" required value={formData.billing_city} hasError={formErrors.billing_city} onChange={handleFieldChange} />
                    <FormTextField label="State" field="billing_state" value={formData.billing_state} onChange={handleFieldChange} />
                    <FormTextField label="Country" field="billing_country" value={formData.billing_country} onChange={handleFieldChange} />
                    <FormTextField label="Pincode" field="billing_pincode" value={formData.billing_pincode} onChange={handleFieldChange} maxLength={10} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-teal-500" /> Shipping address
                </legend>
                <div className="mt-3">
                  <label className="mb-3 flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={formData.same_as_billing}
                      onChange={(e) => handleSameAsBillingToggle(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm text-slate-600">Same as billing address</span>
                  </label>
                  {!formData.same_as_billing && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Address</label>
                        <textarea value={formData.shipping_street}
                          onChange={(e) => setFormData((p) => ({ ...p, shipping_street: e.target.value }))}
                          rows={2}
                          className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          placeholder="Enter shipping address" />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <FormTextField label="City" field="shipping_city" value={formData.shipping_city} onChange={handleFieldChange} />
                        <FormTextField label="State" field="shipping_state" value={formData.shipping_state} onChange={handleFieldChange} />
                        <FormTextField label="Country" field="shipping_country" value={formData.shipping_country} onChange={handleFieldChange} />
                        <FormTextField label="Pincode" field="shipping_pincode" value={formData.shipping_pincode} onChange={handleFieldChange} maxLength={10} />
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Group & balance
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="flex min-w-0 items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Group</label>
                      <div className="relative">
                        <select value={formData.group_id as string}
                          onChange={(e) => setFormData((p) => ({ ...p, group_id: e.target.value }))}
                          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 pr-9 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="">Select group</option>
                          {customerGroups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      </div>
                    </div>
                    <Button type="button" variant="outline" onClick={() => setShowGroupModal(true)} className="h-10 shrink-0 rounded-xl">
                      <FiPlus className="mr-1.5" size={14} /> Add
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <FormTextField label="Opening balance" field="opening_balance" type="number" value={formData.opening_balance} onChange={handleFieldChange} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding amount</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
                        <input type="number" value={formData.outstanding_amount ?? ''}
                          onChange={(e) => setFormData((p) => ({ ...p, outstanding_amount: e.target.value }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          placeholder="0" step="0.01" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Credit limit</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">₹</span>
                        <input type="number" value={formData.credit_limit ?? ''}
                          onChange={(e) => setFormData((p) => ({ ...p, credit_limit: e.target.value }))}
                          className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3.5 text-sm text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                          placeholder="0" step="0.01" />
                      </div>
                    </div>
                    <FormTextField label="Due days" field="due_days" type="number" value={formData.due_days} onChange={handleFieldChange} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> Custom fields
                </legend>
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormTextField label="License no." field="license_no" value={formData.license_no} onChange={handleFieldChange} />
                  <FormTextField label="Custom field 1" field="custom_field_1" value={formData.custom_field_1} onChange={handleFieldChange} />
                  <FormTextField label="Custom field 2" field="custom_field_2" value={formData.custom_field_2} onChange={handleFieldChange} />
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-xl border border-slate-200 p-4">
                <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Additional details
                </legend>
                <div className="mt-3 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <FormTextField label="Fax no" field="fax" value={formData.fax} onChange={handleFieldChange} />
                    <FormTextField label="Website" field="website" value={formData.website} onChange={handleFieldChange} />
                    <FormTextField label="E-way distance (km)" field="eway_bill_distance" type="number" value={formData.eway_bill_distance} onChange={handleFieldChange} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Note</label>
                    <textarea value={formData.note}
                      onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                      rows={2}
                      className="min-h-[80px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10"
                      placeholder="Enter note" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="is_active" checked={formData.is_active}
                      onChange={(e) => setFormData((p) => ({ ...p, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="is_active" className="text-sm text-slate-600">
                      Enable — visible on all documents
                    </label>
                  </div>
                </div>
              </fieldset>
            </div>
          </Offcanvas>
        </Suspense>
      )}

      {/* Add group modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => !addingGroup && setShowGroupModal(false)} />
          <div className="animate-fadeIn relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-500/10">
                <FiUsers size={18} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Add customer group</h3>
                <p className="text-xs text-slate-500">Group customers for easier filtering.</p>
              </div>
            </div>
            <Input type="text" value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="h-10 rounded-xl border-slate-200" placeholder="Group name"
              onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim() && !addingGroup) { e.preventDefault(); void handleAddGroup(); } }} />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline"
                onClick={() => { setShowGroupModal(false); setNewGroupName(''); }}
                disabled={addingGroup} className="rounded-xl">
                Cancel
              </Button>
              <Button type="button" onClick={handleAddGroup}
                disabled={addingGroup || !newGroupName.trim()}
                className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                {addingGroup ? 'Adding…' : 'Add group'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import offcanvas */}
      {isImportOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl bg-white p-8 text-sm text-slate-600 shadow-xl">Loading…</div>
          </div>
        }>
          <Offcanvas isOpen={isImportOpen} title="Import customers"
            onClose={() => setIsImportOpen(false)}
            footer={
              <div className="flex w-full justify-between">
                <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}
                  disabled={importLoading} className="rounded-xl">Close</Button>
                {importStep === 'select' && (
                  <Button type="button" onClick={() => fileInputRef.current?.click()}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">Browse file</Button>
                )}
                {importStep === 'preview' && !importLoading && (
                  <Button type="button" onClick={handleImport}
                    disabled={!importSummary || importSummary.valid === 0}
                    className="rounded-xl bg-emerald-600 font-semibold hover:bg-emerald-700">
                    Import{importSummary ? ` (${importSummary.valid} valid)` : ''}
                  </Button>
                )}
                {importStep === 'result' && (
                  <Button type="button" onClick={() => { setIsImportOpen(false); refreshCustomers(); }}
                    className="rounded-xl bg-indigo-600 font-semibold hover:bg-indigo-700">
                    Close & refresh
                  </Button>
                )}
              </div>
            }>
            <div className="customers-form-scroll space-y-5 pr-2">
              {importStep === 'select' && (
                <>
                  <p className="text-sm text-slate-600">
                    Upload a CSV file to import customers. The file must match the required format.
                    You can download a template below.
                  </p>
                  <div className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300'}`}
                    onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
                    <FiUpload size={40} className="mx-auto mb-3 text-slate-400" />
                    <p className="text-sm text-slate-600">Drag and drop your CSV file here, or click to browse</p>
                    <input type="file" ref={fileInputRef}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileChange(file); }}
                      accept=".csv,text/csv" className="hidden" />
                    <Button type="button" onClick={() => fileInputRef.current?.click()}
                      variant="outline" className="mt-3 rounded-xl">Browse files</Button>
                  </div>
                  {importFile && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <FiFile className="shrink-0 text-indigo-600" size={16} />
                        <span className="truncate text-sm font-medium">{importFile.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">({(importFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button type="button"
                        onClick={() => { setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; setImportStep('select'); }}
                        className="grid h-7 w-7 place-items-center rounded-lg text-red-500 transition hover:bg-red-50"
                        aria-label="Remove file">
                        <FiX size={16} />
                      </button>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <button type="button" onClick={handleDownloadTemplate}
                      className="flex items-center gap-1 text-sm font-medium text-indigo-600 underline-offset-2 hover:underline">
                      <FiDownload size={14} /> Download template
                    </button>
                    {importFile && (
                      <Button type="button" onClick={() => handlePreview(importFile)}
                        disabled={importLoading}
                        className="rounded-xl bg-slate-900 font-semibold hover:bg-slate-800">
                        {importLoading ? 'Processing…' : 'Preview'}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {importStep === 'preview' && (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duplicate action</span>
                      <div className="relative">
                        <select value={duplicateAction}
                          onChange={(e) => setDuplicateAction(e.target.value as DuplicateAction)}
                          disabled={importLoading}
                          className="h-9 appearance-none rounded-lg border border-slate-200 bg-white px-3 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10">
                          <option value="skip">Skip</option>
                          <option value="update">Update</option>
                          <option value="stop">Stop</option>
                        </select>
                        <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-600">Total: <strong className="text-slate-900">{importSummary?.total || 0}</strong></span>
                      <span className="text-emerald-600">Valid: <strong>{importSummary?.valid || 0}</strong></span>
                      <span className="text-red-600">Invalid: <strong>{importSummary?.invalid || 0}</strong></span>
                    </div>
                  </div>
                  {importLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              {['#', 'Name', 'Email', 'Contact', 'City', 'Valid'].map((h) => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.slice(0, 50).map((row) => (
                              <tr key={row.row} className={`border-t border-slate-100 ${row.valid ? '' : 'bg-red-50/60'}`}>
                                <td className="px-3 py-2 text-xs text-slate-600">{row.row}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.name as string) || '-'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.email as string) || '-'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.contact_no as string) || '-'}</td>
                                <td className="px-3 py-2 text-xs text-slate-700">{(row.data.billing_city as string) || '-'}</td>
                                <td className="px-3 py-2 text-xs">
                                  {row.valid
                                    ? <FiCheck className="text-emerald-600" size={14} />
                                    : <FiAlertTriangle className="text-red-600" size={14} aria-label={Object.values(row.errors).join(', ')} />}
                                </td>
                              </tr>
                            ))}
                            {importPreview.length > 50 && (
                              <tr className="border-t border-slate-100">
                                <td colSpan={6} className="px-3 py-2 text-center text-xs text-slate-500">
                                  … and {importPreview.length - 50} more rows
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {importErrors.length > 0 && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                          <p className="mb-2 text-xs font-semibold text-red-700">Validation errors:</p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-600">
                            {importErrors.slice(0, 20).map((err, idx) => (
                              <li key={idx}>Row {err.row}: {err.field} – {err.message}</li>
                            ))}
                            {importErrors.length > 20 && <li>… and {importErrors.length - 20} more</li>}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {importStep === 'result' && (
                <div className="space-y-4">
                  <div className={`rounded-xl p-4 ${importSuccess ? 'border border-emerald-200 bg-emerald-50' : 'border border-red-200 bg-red-50'}`}>
                    <h3 className="text-base font-bold text-slate-900">
                      {importSuccess ? 'Import completed' : 'Import failed'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">{importResultMessage}</p>
                  </div>
                  {importSummary && (
                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                      {[
                        { label: 'Total', value: importSummary.total, cls: 'bg-slate-50 text-slate-900' },
                        { label: 'Created', value: importSummary.created ?? 0, cls: 'bg-emerald-50 text-emerald-700' },
                        { label: 'Updated', value: importSummary.updated ?? 0, cls: 'bg-indigo-50 text-indigo-700' },
                        { label: 'Skipped', value: importSummary.skipped ?? 0, cls: 'bg-amber-50 text-amber-700' },
                        { label: 'Failed', value: importSummary.failed ?? 0, cls: 'bg-red-50 text-red-700' },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls}`}>
                          <div className="text-lg font-bold">{s.value}</div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {importErrors.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Errors ({importErrors.length})</p>
                        <button type="button" onClick={handleDownloadErrorReport}
                          className="flex items-center gap-1 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline">
                          <FiDownload size={12} /> Download report
                        </button>
                      </div>
                      <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              {['Row', 'Field', 'Message'].map((h) => (
                                <th key={h} className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {importErrors.slice(0, 50).map((err, idx) => (
                              <tr key={idx} className="border-t border-slate-100">
                                <td className="px-3 py-1.5 text-slate-600">{err.row}</td>
                                <td className="px-3 py-1.5 text-slate-600">{err.field}</td>
                                <td className="px-3 py-1.5 text-slate-700">{err.message}</td>
                              </tr>
                            ))}
                            {importErrors.length > 50 && (
                              <tr className="border-t border-slate-100">
                                <td colSpan={3} className="px-3 py-1.5 text-center text-slate-500">
                                  … and {importErrors.length - 50} more
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Offcanvas>
        </Suspense>
      )}
    </>
  );
}

export default CustomersPage;