import React, { useEffect, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface InvoiceParty {
  id?: number;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  pan?: string;
}

export interface PrintableInvoiceItem {
  id?: number;
  product_id?: number;
  product_name?: string;
  product?: { name?: string; hsn_sac_code?: string; uom?: string; unit?: string };
  description?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_price?: number;
  price?: number;
  igst_percent?: number;
  tax_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  discount_percent?: number;
  discount_amount?: number;
  total?: number;
}

export interface PrintableInvoice {
  id: number;
  invoice_no: string;
  company?: InvoiceParty & {
    bank_account_name?: string;
    bank_name?: string;
    bank_branch?: string;
    bank_account_no?: string;
    bank_ifsc?: string;
    logo_url?: string;
  };
  branch?: {
    id?: number;
    name?: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null;
  customer?: InvoiceParty;
  customer_name?: string;
  customer_address?: string;
  contact_person?: string;
  phone_no?: string;
  gstin?: string;
  pan?: string;
  reverse_charge?: boolean;
  ship_to?: string;
  shipping_address?: string;
  place_of_supply?: string;
  invoice_type?: string;
  invoice_date?: string;
  created_at?: string;
  challan_no?: string;
  challan_date?: string;
  po_no?: string;
  po_date?: string;
  lr_no?: string;
  eway_no?: string;
  delivery_mode?: string;
  payment_type?: string;
  payment_received?: number | string;
  keep_advance?: boolean;
  packing_charges?: number | string;
  shipping_charges?: number | string;
  general_discount_percent?: number;
  general_discount_amount?: number;
  round_off?: number;
  total_amount?: number | string;
  tax_amount?: number | string;
  discount_amount?: number | string;
  status: string;
  due_date?: string | null;
  notes?: string;
  terms_detail?: string;
  document_note?: string;
  items?: PrintableInvoiceItem[];
  payments?: { amount: number | string; payment_method?: string; transaction_date?: string; reference_no?: string }[];
}

interface Props {
  invoices: PrintableInvoice[];
  onReady?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatMoney(amount: number | string | undefined | null): string {
  const n = Number(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function numberToWordsINR(amount: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertBelowThousand(n: number): string {
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
      const unit = remainder % 10;
      words += tens[ten];
      if (unit > 0) words += ' ' + units[unit];
    }
    return words.trim();
  }

  if (amount === 0) return 'Zero Rupees Only';
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = '';
  let n = rupees;
  const parts: number[] = [];
  while (n > 0) {
    parts.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] > 0) {
      let prefix = convertBelowThousand(parts[i]);
      if (i === 1) prefix += ' Thousand';
      else if (i === 2) prefix += ' Lakh';
      else if (i === 3) prefix += ' Crore';
      words = prefix + ' ' + words;
    }
  }
  words = words.trim() + ' Rupees';
  if (paise > 0) words += ' and ' + convertBelowThousand(paise) + ' Paise';
  return words + ' Only';
}

// =============================================================================
// SUBCOMPONENT: SINGLE INVOICE A4 PAGE
// =============================================================================

function SingleInvoiceA4({ invoice }: { invoice: PrintableInvoice }) {
  const num = (v: any) => Number(v) || 0;

  const company = invoice.company || {};
  const branch = invoice.branch;
  const sellerName = branch?.name ? `${company.name || 'RAPTOR ENTERPRISE'} - ${branch.name}` : (company.name || 'RAPTOR ENTERPRISE');
  const sellerAddress = branch?.address || company.address || '';
  const sellerCity = company.city || '';
  const sellerState = company.state || '';
  const sellerPhone = branch?.phone || company.phone || '';
  const sellerEmail = branch?.email || company.email || '';
  const sellerGstin = company.gstin || '';
  const sellerPan = company.pan || '';

  const customer = invoice.customer || {};
  const buyerName = customer.name || invoice.customer_name || 'Cash Customer';
  const buyerAddress = customer.address || invoice.customer_address || '';
  const buyerPhone = customer.phone || invoice.phone_no || '';
  const buyerEmail = customer.email || '';
  const buyerGstin = customer.gstin || invoice.gstin || '';
  const buyerPan = customer.pan || invoice.pan || '';

  const shipAddress = invoice.ship_to || invoice.shipping_address || buyerAddress;

  // Process items
  const items = (invoice.items ?? []).map((raw, idx) => {
    const it = raw as any;
    const name = it.product?.name || it.product_name || `Item #${idx + 1}`;
    const desc = it.description || '';
    const hsn = it.product?.hsn_sac_code || it.hsn_code || it.hsn_sac_code || '—';
    const qty = num(it.quantity ?? it.qty ?? 1);
    const uom = (it.uom || it.unit || it.product?.uom || it.product?.unit || 'NOS').toUpperCase();
    const rate = num(it.unit_price ?? it.price ?? 0);
    const discPct = num(it.discount_percent ?? 0);
    const lineGross = qty * rate;
    const discAmt = num(it.discount_amount) || (lineGross * discPct) / 100;
    const taxable = lineGross - discAmt;
    const gstRate = num(it.igst_percent ?? it.tax_rate ?? it.gst_slab ?? 0);

    const cgst = num(it.cgst_amount) || (gstRate > 0 ? (taxable * (gstRate / 2)) / 100 : 0);
    const sgst = num(it.sgst_amount) || (gstRate > 0 ? (taxable * (gstRate / 2)) / 100 : 0);
    const totalTax = cgst + sgst;
    const lineTotal = num(it.total) || (taxable + totalTax);

    return {
      idx: idx + 1,
      name,
      desc,
      hsn,
      qty,
      uom,
      rate,
      discAmt,
      taxable,
      gstRate,
      cgst,
      sgst,
      lineTotal,
    };
  });

  const taxableSubtotal = items.reduce((sum, i) => sum + i.taxable, 0);
  const totalCgst = items.reduce((sum, i) => sum + i.cgst, 0);
  const totalSgst = items.reduce((sum, i) => sum + i.sgst, 0);
  const totalDiscount = items.reduce((sum, i) => sum + i.discAmt, 0);
  const packingCharges = num(invoice.packing_charges);
  const shippingCharges = num(invoice.shipping_charges);
  const roundOff = num(invoice.round_off);

  const calculatedTax = totalCgst + totalSgst;
  const grandTotal = num(invoice.total_amount) || (taxableSubtotal + calculatedTax + packingCharges + shippingCharges + roundOff);

  const paidAmount = num(invoice.payment_received ?? invoice.payments?.reduce((acc, p) => acc + num(p.amount), 0));
  const balanceDue = Math.max(0, grandTotal - paidAmount);

  const isPaid = balanceDue <= 0.01;
  const isPartial = paidAmount > 0 && !isPaid;
  const statusBadge = isPaid
    ? { label: 'PAID', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' }
    : isPartial
      ? { label: 'PARTIAL', bg: '#fef3c7', text: '#b45309', border: '#fde68a' }
      : { label: 'DUE', bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' };

  const amountInWords = numberToWordsINR(grandTotal);

  // Group by HSN for GST breakdown
  const hsnMap: Record<string, { hsn: string; taxable: number; cgst: number; sgst: number; total: number }> = {};
  items.forEach((it) => {
    const key = it.hsn || '—';
    if (!hsnMap[key]) {
      hsnMap[key] = { hsn: key, taxable: 0, cgst: 0, sgst: 0, total: 0 };
    }
    hsnMap[key].taxable += it.taxable;
    hsnMap[key].cgst += it.cgst;
    hsnMap[key].sgst += it.sgst;
    hsnMap[key].total += it.cgst + it.sgst;
  });
  const hsnSummary = Object.values(hsnMap);

  return (
    <div className="a4-sheet">
      {/* ── TOP BANNER / BRANDING HEADER ──────────────────────────── */}
      <div className="header-box">
        <div className="brand-col">
          <div className="brand-title">{sellerName}</div>
          <div className="brand-subtitle">
            {sellerAddress}
            {sellerCity ? `, ${sellerCity}` : ''}
            {sellerState ? `, ${sellerState}` : ''}
          </div>
          <div className="meta-row">
            {sellerPhone && <span><strong>Tel:</strong> {sellerPhone}</span>}
            {sellerEmail && <span><strong>Email:</strong> {sellerEmail}</span>}
          </div>
          <div className="meta-row">
            {sellerGstin && <span><strong>GSTIN:</strong> {sellerGstin}</span>}
            {sellerPan && <span><strong>PAN:</strong> {sellerPan}</span>}
          </div>
        </div>

        <div className="doc-col">
          <div className="doc-pill">TAX INVOICE</div>
          <div
            className="status-pill"
            style={{
              backgroundColor: statusBadge.bg,
              color: statusBadge.text,
              borderColor: statusBadge.border,
            }}
          >
            {statusBadge.label}
          </div>

          <table className="meta-grid">
            <tbody>
              <tr>
                <td className="meta-k">Invoice No:</td>
                <td className="meta-v">{invoice.invoice_no}</td>
              </tr>
              <tr>
                <td className="meta-k">Invoice Date:</td>
                <td className="meta-v">{formatDate(invoice.invoice_date || invoice.created_at)}</td>
              </tr>
              {invoice.due_date && (
                <tr>
                  <td className="meta-k">Due Date:</td>
                  <td className="meta-v">{formatDate(invoice.due_date)}</td>
                </tr>
              )}
              {invoice.po_no && (
                <tr>
                  <td className="meta-k">PO No / Ref:</td>
                  <td className="meta-v">{invoice.po_no}</td>
                </tr>
              )}
              {invoice.challan_no && (
                <tr>
                  <td className="meta-k">Challan No:</td>
                  <td className="meta-v">{invoice.challan_no}</td>
                </tr>
              )}
              <tr>
                <td className="meta-k">Place of Supply:</td>
                <td className="meta-v">{invoice.place_of_supply || sellerState || 'Bihar'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PARTIES GRID: BILLED TO & SHIPPED TO ─────────────────── */}
      <div className="parties-grid">
        <div className="party-box">
          <div className="party-head">BILLED TO (BUYER)</div>
          <div className="party-name">{buyerName}</div>
          {buyerAddress && <div className="party-line">{buyerAddress}</div>}
          <div className="party-meta">
            {buyerPhone && <div><strong>Phone:</strong> {buyerPhone}</div>}
            {buyerEmail && <div><strong>Email:</strong> {buyerEmail}</div>}
            {buyerGstin && <div><strong>GSTIN:</strong> {buyerGstin}</div>}
            {buyerPan && <div><strong>PAN:</strong> {buyerPan}</div>}
          </div>
        </div>

        <div className="party-box">
          <div className="party-head">SHIPPED TO (CONSIGNEE / SITE)</div>
          <div className="party-name">{invoice.contact_person || buyerName}</div>
          <div className="party-line">{shipAddress || 'Same as billing address'}</div>
          <div className="party-meta">
            {invoice.delivery_mode && <div><strong>Mode:</strong> {invoice.delivery_mode}</div>}
            {invoice.lr_no && <div><strong>LR / Transporter:</strong> {invoice.lr_no}</div>}
            {invoice.eway_no && <div><strong>E-Way Bill:</strong> {invoice.eway_no}</div>}
          </div>
        </div>
      </div>

      {/* ── LINE ITEMS TABLE ───────────────────────────────────────── */}
      <div className="table-wrap">
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '28px' }} className="tc">#</th>
              <th className="tl">Item Description &amp; Specifications</th>
              <th style={{ width: '68px' }} className="tc">HSN/SAC</th>
              <th style={{ width: '48px' }} className="tr">Qty</th>
              <th style={{ width: '42px' }} className="tc">Unit</th>
              <th style={{ width: '68px' }} className="tr">Rate (₹)</th>
              <th style={{ width: '50px' }} className="tr">Disc</th>
              <th style={{ width: '68px' }} className="tr">Taxable (₹)</th>
              <th style={{ width: '48px' }} className="tc">GST %</th>
              <th style={{ width: '80px' }} className="tr">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.idx}>
                <td className="tc">{it.idx}</td>
                <td className="tl">
                  <div className="item-name">{it.name}</div>
                  {it.desc && <div className="item-sub">{it.desc}</div>}
                </td>
                <td className="tc font-mono">{it.hsn}</td>
                <td className="tr font-num">{it.qty}</td>
                <td className="tc">{it.uom}</td>
                <td className="tr font-num">{formatMoney(it.rate)}</td>
                <td className="tr font-num">{it.discAmt > 0 ? formatMoney(it.discAmt) : '—'}</td>
                <td className="tr font-num">{formatMoney(it.taxable)}</td>
                <td className="tc">{it.gstRate > 0 ? `${it.gstRate}%` : '0%'}</td>
                <td className="tr font-num font-bold">{formatMoney(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── LOWER SECTION: DUAL COLUMN (SUMMARY + AUDIT + TOTALS) ──── */}
      <div className="bottom-layout">
        <div className="left-col">
          {/* Amount in words */}
          <div className="card-box">
            <div className="card-title">AMOUNT IN WORDS</div>
            <div className="words-content">Indian Rupee {amountInWords}</div>
          </div>

          {/* HSN Summary table */}
          {hsnSummary.length > 0 && (
            <div className="card-box">
              <div className="card-title">GST SUMMARY BREAKDOWN</div>
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>HSN/SAC</th>
                    <th className="tr">Taxable (₹)</th>
                    <th className="tr">CGST (₹)</th>
                    <th className="tr">SGST (₹)</th>
                    <th className="tr">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {hsnSummary.map((h, i) => (
                    <tr key={i}>
                      <td className="font-mono">{h.hsn}</td>
                      <td className="tr font-num">{formatMoney(h.taxable)}</td>
                      <td className="tr font-num">{formatMoney(h.cgst)}</td>
                      <td className="tr font-num">{formatMoney(h.sgst)}</td>
                      <td className="tr font-num font-bold">{formatMoney(h.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bank Account Details */}
          {company.bank_name && (
            <div className="card-box">
              <div className="card-title">BANK REMITTANCE DETAILS</div>
              <div className="bank-meta">
                <div><strong>Bank Name:</strong> {company.bank_name}</div>
                {company.bank_account_no && <div><strong>Account No:</strong> {company.bank_account_no}</div>}
                {company.bank_ifsc && <div><strong>IFSC Code:</strong> {company.bank_ifsc}</div>}
                {company.bank_branch && <div><strong>Branch:</strong> {company.bank_branch}</div>}
                {company.bank_account_name && <div><strong>Beneficiary:</strong> {company.bank_account_name}</div>}
              </div>
            </div>
          )}

          {/* Terms */}
          <div className="card-box">
            <div className="card-title">TERMS &amp; CONDITIONS</div>
            <div className="terms-content">
              {invoice.terms_detail ||
                invoice.document_note ||
                '1. Goods once sold will not be returned without prior written authorization.\n2. Interest @ 18% p.a. will be levied on overdue payments.\n3. Subject to jurisdiction of local district courts only.'}
            </div>
          </div>
        </div>

        <div className="right-col">
          {/* Financial Totals */}
          <table className="totals-table">
            <tbody>
              <tr>
                <td className="tot-k">Taxable Subtotal:</td>
                <td className="tot-v">₹{formatMoney(taxableSubtotal)}</td>
              </tr>
              {totalDiscount > 0 && (
                <tr>
                  <td className="tot-k text-rose">Total Discount:</td>
                  <td className="tot-v text-rose">-₹{formatMoney(totalDiscount)}</td>
                </tr>
              )}
              {totalCgst > 0 && (
                <tr>
                  <td className="tot-k">CGST:</td>
                  <td className="tot-v">₹{formatMoney(totalCgst)}</td>
                </tr>
              )}
              {totalSgst > 0 && (
                <tr>
                  <td className="tot-k">SGST:</td>
                  <td className="tot-v">₹{formatMoney(totalSgst)}</td>
                </tr>
              )}
              {packingCharges > 0 && (
                <tr>
                  <td className="tot-k">Packing &amp; Freight:</td>
                  <td className="tot-v">₹{formatMoney(packingCharges)}</td>
                </tr>
              )}
              {shippingCharges > 0 && (
                <tr>
                  <td className="tot-k">Shipping / Delivery:</td>
                  <td className="tot-v">₹{formatMoney(shippingCharges)}</td>
                </tr>
              )}
              {roundOff !== 0 && (
                <tr>
                  <td className="tot-k">Round Off:</td>
                  <td className="tot-v">
                    {roundOff > 0 ? `+₹${formatMoney(roundOff)}` : `-₹${formatMoney(Math.abs(roundOff))}`}
                  </td>
                </tr>
              )}
              <tr className="grand-row">
                <td className="tot-k">GRAND TOTAL:</td>
                <td className="tot-v">₹{formatMoney(grandTotal)}</td>
              </tr>
              {paidAmount > 0 && (
                <>
                  <tr className="paid-row">
                    <td className="tot-k">Amount Received:</td>
                    <td className="tot-v">₹{formatMoney(paidAmount)}</td>
                  </tr>
                  <tr className="balance-row">
                    <td className="tot-k">Balance Due:</td>
                    <td className="tot-v">₹{formatMoney(balanceDue)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          {/* Authorized Signature Box */}
          <div className="sign-card">
            <div className="sign-head">For {sellerName}</div>
            <div className="sign-space"></div>
            <div className="sign-line">Authorised Signatory</div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <div className="sheet-footer">
        <span>This is a Computer Generated Tax Invoice</span>
        <span>•</span>
        <span>RaptorERP Enterprise Logistics &amp; Distribution</span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN BULK EXPORT COMPONENT
// =============================================================================

export const BulkInvoicePrint: React.FC<Props> = ({ invoices, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!invoices.length) return;
    const timer = setTimeout(() => {
      window.print();
      onReady?.();
    }, 450);
    return () => clearTimeout(timer);
  }, [invoices, onReady]);

  return (
    <div ref={containerRef} className="bulk-a4-invoice-container">
      {invoices.map((inv) => (
        <SingleInvoiceA4 key={inv.id} invoice={inv} />
      ))}

      <style>{`
        /* Screen preview styling */
        .bulk-a4-invoice-container {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm 8mm 8mm 8mm;
          }

          *, *::before, *::after {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .bulk-a4-invoice-container, .bulk-a4-invoice-container * {
            visibility: visible !important;
          }

          .bulk-a4-invoice-container {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }

          .a4-sheet {
            width: 100% !important;
            max-width: 210mm !important;
            min-height: 285mm !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            font-size: 9.5px !important;
            line-height: 1.35 !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .a4-sheet:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }

          .header-box {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            border-bottom: 2px solid #0f172a !important;
            padding-bottom: 8px !important;
            margin-bottom: 8px !important;
          }

          .brand-col {
            max-width: 58% !important;
          }

          .brand-title {
            font-size: 17px !important;
            font-weight: 800 !important;
            color: #0f172a !important;
            text-transform: uppercase !important;
            letter-spacing: -0.3px !important;
            margin-bottom: 2px !important;
          }

          .brand-subtitle {
            font-size: 9px !important;
            color: #475569 !important;
            line-height: 1.3 !important;
            margin-bottom: 3px !important;
          }

          .meta-row {
            font-size: 8.5px !important;
            color: #334155 !important;
            display: flex !important;
            gap: 12px !important;
            margin-top: 1.5px !important;
          }

          .doc-col {
            text-align: right !important;
            min-width: 200px !important;
          }

          .doc-pill {
            display: inline-block !important;
            background: #0f172a !important;
            color: #ffffff !important;
            font-weight: 800 !important;
            font-size: 12px !important;
            letter-spacing: 0.8px !important;
            padding: 2.5px 10px !important;
            border-radius: 4px !important;
            text-transform: uppercase !important;
            margin-bottom: 3px !important;
          }

          .status-pill {
            display: inline-block !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            padding: 1px 6px !important;
            border-radius: 3px !important;
            border: 1px solid transparent !important;
            margin-left: 6px !important;
            vertical-align: middle !important;
          }

          .meta-grid {
            margin-left: auto !important;
            border-collapse: collapse !important;
            font-size: 9px !important;
            margin-top: 3px !important;
          }

          .meta-k {
            color: #64748b !important;
            padding: 1px 6px 1px 0 !important;
            text-align: right !important;
            font-weight: 500 !important;
          }

          .meta-v {
            color: #0f172a !important;
            padding: 1px 0 !important;
            text-align: right !important;
            font-weight: 700 !important;
          }

          .parties-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            margin-bottom: 8px !important;
          }

          .party-box {
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            padding: 6px 8px !important;
            background: #f8fafc !important;
          }

          .party-head {
            font-size: 8.5px !important;
            font-weight: 800 !important;
            color: #475569 !important;
            text-transform: uppercase !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding-bottom: 2px !important;
            margin-bottom: 3px !important;
            letter-spacing: 0.4px !important;
          }

          .party-name {
            font-size: 11px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
            margin-bottom: 2px !important;
          }

          .party-line {
            font-size: 8.5px !important;
            color: #475569 !important;
            margin-bottom: 3px !important;
            line-height: 1.25 !important;
          }

          .party-meta {
            font-size: 8.5px !important;
            color: #334155 !important;
            line-height: 1.3 !important;
          }

          .table-wrap {
            margin-bottom: 8px !important;
          }

          table.items-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8.5px !important;
          }

          table.items-table thead {
            display: table-header-group !important;
          }

          table.items-table th {
            background: #0f172a !important;
            color: #ffffff !important;
            font-weight: 700 !important;
            font-size: 8px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.3px !important;
            padding: 5px 4px !important;
            border: 1px solid #0f172a !important;
          }

          table.items-table td {
            padding: 4px 4px !important;
            border: 1px solid #cbd5e1 !important;
            vertical-align: top !important;
          }

          table.items-table tbody tr:nth-child(even) {
            background: #f8fafc !important;
          }

          .tc { text-align: center !important; }
          .tl { text-align: left !important; }
          .tr { text-align: right !important; }
          .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; }
          .font-num { font-variant-numeric: tabular-nums !important; }

          .item-name {
            font-weight: 700 !important;
            color: #0f172a !important;
            font-size: 9px !important;
          }

          .item-sub {
            font-size: 8px !important;
            color: #64748b !important;
            margin-top: 1px !important;
          }

          .bottom-layout {
            display: grid !important;
            grid-template-columns: 1.2fr 0.8fr !important;
            gap: 8px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            margin-bottom: 6px !important;
          }

          .card-box {
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            padding: 5px 7px !important;
            margin-bottom: 5px !important;
            background: #ffffff !important;
          }

          .card-title {
            font-size: 8px !important;
            font-weight: 800 !important;
            color: #475569 !important;
            text-transform: uppercase !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding-bottom: 2px !important;
            margin-bottom: 3px !important;
            letter-spacing: 0.3px !important;
          }

          .words-content {
            font-size: 8.5px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
            font-style: italic !important;
          }

          .mini-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8px !important;
          }

          .mini-table th {
            text-align: left !important;
            color: #64748b !important;
            padding: 2px 3px !important;
            border-bottom: 1px solid #e2e8f0 !important;
            font-weight: 600 !important;
          }

          .mini-table td {
            padding: 2px 3px !important;
            border-bottom: 1px solid #f1f5f9 !important;
          }

          .bank-meta {
            font-size: 8px !important;
            color: #334155 !important;
            line-height: 1.35 !important;
          }

          .terms-content {
            font-size: 7.5px !important;
            color: #475569 !important;
            white-space: pre-wrap !important;
            line-height: 1.3 !important;
          }

          .totals-table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 9px !important;
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            margin-bottom: 6px !important;
          }

          .totals-table td {
            padding: 3px 6px !important;
            border-bottom: 1px solid #f1f5f9 !important;
          }

          .tot-k {
            color: #64748b !important;
          }

          .tot-v {
            text-align: right !important;
            font-weight: 600 !important;
            font-variant-numeric: tabular-nums !important;
          }

          .text-rose { color: #dc2626 !important; }

          .grand-row {
            background: #0f172a !important;
            color: #ffffff !important;
            font-weight: 800 !important;
            font-size: 10px !important;
          }

          .grand-row td {
            color: #ffffff !important;
            padding: 4px 6px !important;
            border: none !important;
          }

          .paid-row td {
            color: #16a34a !important;
            font-weight: 700 !important;
          }

          .balance-row td {
            color: #dc2626 !important;
            font-weight: 800 !important;
            background: #fef2f2 !important;
          }

          .sign-card {
            border: 1px solid #cbd5e1 !important;
            border-radius: 4px !important;
            padding: 6px 8px !important;
            text-align: right !important;
            background: #fafafa !important;
          }

          .sign-head {
            font-size: 8.5px !important;
            font-weight: 700 !important;
            color: #0f172a !important;
          }

          .sign-space {
            height: 34px !important;
          }

          .sign-line {
            font-size: 8px !important;
            font-style: italic !important;
            color: #475569 !important;
            border-top: 1px dashed #94a3b8 !important;
            display: inline-block !important;
            padding-top: 2px !important;
            min-width: 140px !important;
          }

          .sheet-footer {
            display: flex !important;
            justify-content: center !important;
            gap: 8px !important;
            font-size: 7.5px !important;
            color: #94a3b8 !important;
            margin-top: 6px !important;
            text-align: center !important;
            border-top: 1px solid #f1f5f9 !important;
            padding-top: 4px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default BulkInvoicePrint;
