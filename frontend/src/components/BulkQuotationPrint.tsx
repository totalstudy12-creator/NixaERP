import React, { useEffect, useRef } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface PrintableQuotationItem {
  id?: number;
  product_id?: number;
  product_name?: string;
  item_name?: string;
  product?: { name?: string; hsn_sac_code?: string; sku?: string; uom?: string; unit?: string };
  description?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  uom?: string;
  unit_price?: number;
  price?: number;
  discount_percent?: number;
  discount_amount?: number;
  tax_percent?: number;
  tax_rate?: number;
  gst_slab?: number;
  tax_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  total_amount?: number;
  total?: number;
}

export interface PrintableQuotation {
  id: number;
  quotation_number: string;
  reference_no?: string;
  quotation_date: string;
  valid_until: string;
  status: string;
  company?: {
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
    bank_account_name?: string;
    bank_name?: string;
    bank_branch?: string;
    bank_account_no?: string;
    bank_ifsc?: string;
  };
  branch?: {
    id?: number;
    name?: string;
    code?: string;
    address?: string;
    phone?: string;
    email?: string;
  } | null;
  customer?: {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
  };
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  billing_address?: string;
  shipping_address?: string;
  delivery_area?: string;
  gstin?: string;
  pan?: string;
  subtotal?: number;
  taxable_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  shipping_charges?: number;
  other_charges?: number;
  round_off?: number;
  total_amount?: number;
  payment_terms?: string;
  delivery_timeline?: string;
  terms_conditions?: string;
  terms_and_conditions?: string;
  notes?: string;
  items?: PrintableQuotationItem[];
  assignee?: {
    id?: number;
    name?: string;
  };
}

interface Props {
  quotations: PrintableQuotation[];
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
// SUBCOMPONENT: SINGLE QUOTATION A4 PAGE
// =============================================================================

function SingleQuotationA4({ quote }: { quote: PrintableQuotation }) {
  const num = (v: any) => Number(v) || 0;

  const company = quote.company || {};
  const branch = quote.branch;
  const sellerName = branch?.name ? `${company.name || 'RAPTOR ENTERPRISE'} - ${branch.name}` : (company.name || 'RAPTOR ENTERPRISE');
  const sellerAddress = branch?.address || company.address || '';
  const sellerCity = company.city || '';
  const sellerState = company.state || '';
  const sellerPhone = branch?.phone || company.phone || '';
  const sellerEmail = branch?.email || company.email || '';
  const sellerGstin = company.gstin || '';
  const sellerPan = company.pan || '';

  const customerName = quote.customer_name || quote.customer?.name || 'Valued Customer';
  const customerAddress = quote.billing_address || quote.customer?.address || '';
  const customerPhone = quote.customer_phone || quote.customer?.phone || '';
  const customerEmail = quote.customer_email || quote.customer?.email || '';
  const customerGstin = quote.gstin || quote.customer?.gstin || '';
  const customerPan = quote.pan || quote.customer?.pan || '';

  const shippingSite = quote.shipping_address || quote.billing_address || 'Same as billing address';

  // Process items
  const items = (quote.items ?? []).map((raw, idx) => {
    const it = raw as any;
    const name = it.product?.name || it.product_name || it.item_name || `Item #${idx + 1}`;
    const desc = it.description || '';
    const hsn = it.product?.hsn_sac_code || it.hsn_code || it.hsn_sac_code || '—';
    const qty = num(it.quantity ?? it.qty ?? 1);
    const uom = (it.uom || it.unit || it.product?.uom || it.product?.unit || 'NOS').toUpperCase();
    const unitPrice = num(it.unit_price ?? it.price ?? 0);
    const discPct = num(it.discount_percent ?? 0);
    const lineGross = qty * unitPrice;
    const discAmt = num(it.discount_amount) || (lineGross * discPct) / 100;
    const taxable = lineGross - discAmt;
    const gstRate = num(it.tax_percent ?? it.tax_rate ?? it.gst_slab ?? 0);

    const cgst = num(it.cgst_amount) || (gstRate > 0 ? (taxable * (gstRate / 2)) / 100 : 0);
    const sgst = num(it.sgst_amount) || (gstRate > 0 ? (taxable * (gstRate / 2)) / 100 : 0);
    const totalTax = num(it.tax_amount) || (cgst + sgst);
    const lineTotal = num(it.total_amount ?? it.total) || (taxable + totalTax);

    return {
      idx: idx + 1,
      name,
      desc,
      hsn,
      qty,
      uom,
      unitPrice,
      discAmt,
      taxable,
      gstRate,
      cgst,
      sgst,
      totalTax,
      lineTotal,
    };
  });

  const taxableSubtotal = items.reduce((sum, i) => sum + i.taxable, 0);
  const totalCgst = items.reduce((sum, i) => sum + i.cgst, 0);
  const totalSgst = items.reduce((sum, i) => sum + i.sgst, 0);
  const totalDiscount = items.reduce((sum, i) => sum + i.discAmt, 0);
  const totalTax = totalCgst + totalSgst;
  const shippingCharges = num(quote.shipping_charges);
  const otherCharges = num(quote.other_charges);
  const roundOff = num(quote.round_off);

  const grandTotal = num(quote.total_amount) || (taxableSubtotal + totalTax + shippingCharges + otherCharges + roundOff);
  const amountInWords = numberToWordsINR(grandTotal);

  const statusRaw = (quote.status || 'draft').toLowerCase();
  const statusBadge =
    statusRaw === 'accepted' || statusRaw === 'converted'
      ? { label: statusRaw.toUpperCase(), bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' }
      : statusRaw === 'sent'
        ? { label: 'OFFICIAL PROPOSAL', bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe' }
        : statusRaw === 'rejected'
          ? { label: 'REJECTED', bg: '#fee2e2', text: '#b91c1c', border: '#fecaca' }
          : { label: 'PROPOSAL / DRAFT', bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };

  return (
    <div className="a4-quote-sheet">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
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
          <div className="doc-pill">SALES QUOTATION</div>
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
                <td className="meta-k">Quotation #:</td>
                <td className="meta-v">{quote.quotation_number}</td>
              </tr>
              {quote.reference_no && quote.reference_no !== quote.quotation_number && (
                <tr>
                  <td className="meta-k">Reference No:</td>
                  <td className="meta-v">{quote.reference_no}</td>
                </tr>
              )}
              <tr>
                <td className="meta-k">Quotation Date:</td>
                <td className="meta-v">{formatDate(quote.quotation_date)}</td>
              </tr>
              <tr>
                <td className="meta-k" style={{ color: '#b91c1c', fontWeight: 600 }}>Valid Until:</td>
                <td className="meta-v" style={{ color: '#b91c1c', fontWeight: 800 }}>{formatDate(quote.valid_until)}</td>
              </tr>
              {quote.assignee?.name && (
                <tr>
                  <td className="meta-k">Sales Executive:</td>
                  <td className="meta-v">{quote.assignee.name}</td>
                </tr>
              )}
              {quote.payment_terms && (
                <tr>
                  <td className="meta-k">Payment Terms:</td>
                  <td className="meta-v">{quote.payment_terms}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PARTIES GRID ───────────────────────────────────────────── */}
      <div className="parties-grid">
        <div className="party-box">
          <div className="party-head">QUOTATION PREPARED FOR (CLIENT)</div>
          <div className="party-name">{customerName}</div>
          {customerAddress && <div className="party-line">{customerAddress}</div>}
          <div className="party-meta">
            {customerPhone && <div><strong>Phone:</strong> {customerPhone}</div>}
            {customerEmail && <div><strong>Email:</strong> {customerEmail}</div>}
            {customerGstin && <div><strong>GSTIN:</strong> {customerGstin}</div>}
            {customerPan && <div><strong>PAN:</strong> {customerPan}</div>}
          </div>
        </div>

        <div className="party-box">
          <div className="party-head">DELIVERY SITE &amp; PROJECT LOCATION</div>
          <div className="party-name">{customerName}</div>
          <div className="party-line">{shippingSite}</div>
          {quote.delivery_area && (
            <div className="party-meta">
              <strong>Delivery Region:</strong> {quote.delivery_area}
            </div>
          )}
          {quote.delivery_timeline && (
            <div className="party-meta">
              <strong>Expected Delivery:</strong> {quote.delivery_timeline}
            </div>
          )}
        </div>
      </div>

      {/* ── LINE ITEMS TABLE ───────────────────────────────────────── */}
      <div className="table-wrap">
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: '28px' }} className="tc">#</th>
              <th className="tl">Description of Goods / Scope of Supply</th>
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
                <td className="tr font-num">{formatMoney(it.unitPrice)}</td>
                <td className="tr font-num">{it.discAmt > 0 ? formatMoney(it.discAmt) : '—'}</td>
                <td className="tr font-num">{formatMoney(it.taxable)}</td>
                <td className="tc">{it.gstRate > 0 ? `${it.gstRate}%` : '0%'}</td>
                <td className="tr font-num font-bold">{formatMoney(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── BOTTOM DUAL COLUMN ─────────────────────────────────────── */}
      <div className="bottom-layout">
        <div className="left-col">
          {/* Amount in words */}
          <div className="card-box">
            <div className="card-title">ESTIMATED VALUE IN WORDS</div>
            <div className="words-content">Indian Rupee {amountInWords}</div>
          </div>

          {/* Terms & Conditions */}
          <div className="card-box">
            <div className="card-title">COMMERCIAL TERMS &amp; CONDITIONS</div>
            <div className="terms-content">
              {quote.terms_conditions ||
                quote.terms_and_conditions ||
                '1. Quotation prices are strictly valid until the expiry date indicated above.\n2. Taxes & GST are charged as applicable at the time of final invoicing.\n3. Tent, event logistics, and hardware material supply require 50% advance upon confirmation.\n4. Damaged, burned, or missing event equipment will be charged as per replacement schedule.'}
            </div>
          </div>

          {/* Bank Details */}
          {company.bank_name && (
            <div className="card-box">
              <div className="card-title">BANK ACCOUNT DETAILS FOR REMITTANCE</div>
              <div className="bank-meta">
                <div><strong>Bank Name:</strong> {company.bank_name}</div>
                {company.bank_account_no && <div><strong>Account No:</strong> {company.bank_account_no}</div>}
                {company.bank_ifsc && <div><strong>IFSC Code:</strong> {company.bank_ifsc}</div>}
                {company.bank_branch && <div><strong>Branch:</strong> {company.bank_branch}</div>}
              </div>
            </div>
          )}

          {/* Customer Acceptance Signoff Box */}
          <div className="card-box client-sign">
            <div className="card-title">CLIENT ORDER CONFIRMATION &amp; ACCEPTANCE</div>
            <div style={{ fontSize: '7.5px', color: '#475569', marginBottom: '8px' }}>
              I / We hereby accept the pricing, quantities, and terms outlined in this quotation.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '10px' }}>
              <div style={{ fontSize: '8px', color: '#64748b' }}>
                <div>Date: ____________________</div>
                <div style={{ marginTop: '2px' }}>Name: ____________________</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '8px', color: '#334155' }}>
                <div style={{ width: '130px', borderBottom: '1px dashed #94a3b8', height: '18px' }}></div>
                <div style={{ marginTop: '2px', fontStyle: 'italic' }}>Authorized Client Signature</div>
              </div>
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
              {shippingCharges > 0 && (
                <tr>
                  <td className="tot-k">Transportation / Freight:</td>
                  <td className="tot-v">₹{formatMoney(shippingCharges)}</td>
                </tr>
              )}
              {otherCharges > 0 && (
                <tr>
                  <td className="tot-k">Handling &amp; Setup:</td>
                  <td className="tot-v">₹{formatMoney(otherCharges)}</td>
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
                <td className="tot-k">TOTAL ESTIMATED VALUE:</td>
                <td className="tot-v">₹{formatMoney(grandTotal)}</td>
              </tr>
            </tbody>
          </table>

          {/* Authorized Signature Card */}
          <div className="sign-card">
            <div className="sign-head">For {sellerName}</div>
            <div className="sign-space"></div>
            <div className="sign-line">Authorised Signatory</div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <div className="sheet-footer">
        <span>This is a Computer Generated Commercial Quotation · Valid until {formatDate(quote.valid_until)}</span>
        <span>•</span>
        <span>RaptorERP Logistics &amp; Enterprise Management</span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN BULK QUOTATION PRINT COMPONENT
// =============================================================================

export const BulkQuotationPrint: React.FC<Props> = ({ quotations, onReady }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!quotations.length) return;
    const timer = setTimeout(() => {
      window.print();
      onReady?.();
    }, 450);
    return () => clearTimeout(timer);
  }, [quotations, onReady]);

  return (
    <div ref={containerRef} className="bulk-a4-quotation-container">
      {quotations.map((q) => (
        <SingleQuotationA4 key={q.id} quote={q} />
      ))}

      <style>{`
        /* Screen preview styling */
        .bulk-a4-quotation-container {
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

          .bulk-a4-quotation-container, .bulk-a4-quotation-container * {
            visibility: visible !important;
          }

          .bulk-a4-quotation-container {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
          }

          .a4-quote-sheet {
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

          .a4-quote-sheet:last-child {
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

          .terms-content {
            font-size: 7.5px !important;
            color: #475569 !important;
            white-space: pre-wrap !important;
            line-height: 1.3 !important;
          }

          .bank-meta {
            font-size: 8px !important;
            color: #334155 !important;
            line-height: 1.35 !important;
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

export default BulkQuotationPrint;
