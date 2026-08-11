// src/components/OrderPrint.tsx
import React, { useEffect, useRef, useMemo } from 'react';

/* ============================================================
   TYPES
============================================================ */
interface Company {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account_no?: string;
  bank_ifsc?: string;
}

interface Customer {
  id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  gstin?: string;
  pan?: string;
  contact_person?: string;
  mobile?: string;
  email?: string;
}

interface OrderItem {
  product_id?: number;
  product_name?: string;
  product?: { name?: string };
  qty?: number | string;
  quantity?: number | string;
  price?: number | string;
  unit_price?: number | string;
  tax_rate?: number | string;
}

interface Order {
  id: number;
  order_no: string;
  created_at?: string;
  delivery_date?: string | null;
  company?: Company;
  customer?: Customer;
  items: OrderItem[];
  total_amount: number | string;
  tax_amount?: number | string;
  payment_amount?: number | string;
  status?: string;
  payment_status?: string;
  payment_mode?: string;
  shipping_address?: string;
  notes?: string;
  terms?: string[];
}

interface Props {
  order: Order;
  onReady?: () => void;
}

/* ============================================================
   HELPERS
============================================================ */
function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
  };

  const split = (val: number, div: number) => ({
    part: val % div,
    remaining: Math.floor(val / div),
  });

  const cr = split(num, 10000000);
  const lk = split(cr.remaining, 100000);
  const th = split(lk.remaining, 1000);

  const parts = [
    cr.part ? convert(cr.part) + ' Crore' : '',
    lk.part ? convert(lk.part) + ' Lakh' : '',
    th.part ? convert(th.part) + ' Thousand' : '',
    convert(th.remaining),
  ].filter(Boolean);

  return parts.join(' ').replace(/^\w/, (c) => c.toUpperCase());
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN');
}

function formatCurrency(amount: number | string): string {
  const n = Number(amount);
  return isNaN(n) ? '₹ 0.00' : '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

/* ============================================================
   COMPONENT
============================================================ */
const OrderPrint: React.FC<Props> = ({ order, onReady }) => {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);

  // Merge with fallbacks
  const company = useMemo(() => order.company || ({} as Company), [order.company]);
  const customer = useMemo(() => order.customer || ({} as Customer), [order.customer]);

  // Normalize items
  const items = useMemo(() => {
    return (order.items || []).map((item, idx) => ({
      name: item.product_name || item.product?.name || `Item ${idx + 1}`,
      qty: Number(item.qty ?? item.quantity ?? 0),
      price: Number(item.price ?? item.unit_price ?? 0),
      tax_rate: Number(item.tax_rate ?? 0),
    }));
  }, [order.items]);

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.price, 0), [items]);
  const total = useMemo(() => {
    const t = Number(order.total_amount);
    return t > 0 ? t : subtotal;
  }, [order.total_amount, subtotal]);
  const paid = useMemo(() => Number(order.payment_amount ?? 0), [order.payment_amount]);
  const balance = total - paid;
  const totalInWords = numberToWords(Math.round(total));

  const termsList = useMemo(() => {
    if (order.terms && order.terms.length > 0) return order.terms;
    return [
      'Goods once sold will not be taken back.',
      'Payment should be made as per agreed terms.',
      'Subject to our home jurisdiction.',
      'Delivery as per availability and agreed schedule.',
    ];
  }, [order.terms]);

  const emptyRows = Math.max(0, 5 - items.length);

  return (
    <div ref={printRef} className="print-area">
      <div className="page">
        {/* ========== COMPANY HEADER ========== */}
        <div className="company-header">
          <div className="company-name">{company.name || 'Company'}</div>
          <div className="company-address">
            {[company.address, company.city, company.state, company.pincode]
              .filter(Boolean)
              .join(', ') || '-'}
          </div>
          <div className="company-contact">
            Phone: {company.phone || '-'} &nbsp;&nbsp; | &nbsp;&nbsp;
            Email: {company.email || '-'}
          </div>
          <div className="company-gstin">GSTIN: {company.gstin || '-'}</div>
        </div>

        {/* ========== DOCUMENT TITLE ========== */}
        <div className="document-title">SALES ORDER</div>

        {/* ========== ORDER INFORMATION ========== */}
        <table className="document-info">
          <tbody>
            <tr>
              <td className="label">Order No.</td>
              <td className="value bold">{order.order_no || '-'}</td>
              <td className="label">Date</td>
              <td className="value bold">{formatDate(order.created_at)}</td>
            </tr>
            <tr>
              <td className="label">Delivery Date</td>
              <td className="value">{formatDate(order.delivery_date)}</td>
              <td className="label">Status</td>
              <td className="value">{order.status || '-'}</td>
            </tr>
            <tr>
              <td className="label">Payment Status</td>
              <td className="value bold">{order.payment_status || '-'}</td>
              <td className="label">Payment Mode</td>
              <td className="value">{order.payment_mode || '-'}</td>
            </tr>
          </tbody>
        </table>

        {/* ========== PARTY DETAILS ========== */}
        <div className="section-title">Party Details</div>
        <table className="party-table">
          <tbody>
            <tr>
              <td className="party-label">Party Name</td>
              <td className="party-value bold">{customer.name || '-'}</td>
              <td className="party-label">Contact Person</td>
              <td className="party-value">{customer.contact_person || '-'}</td>
            </tr>
            <tr>
              <td className="party-label">Mobile</td>
              <td className="party-value">{customer.mobile || '-'}</td>
              <td className="party-label">Email</td>
              <td className="party-value">{customer.email || '-'}</td>
            </tr>
            <tr>
              <td className="party-label">Billing Address</td>
              <td className="party-value" colSpan={3}>
                {[customer.address, customer.city, customer.state].filter(Boolean).join(', ') || '-'}
              </td>
            </tr>
            <tr>
              <td className="party-label">Shipping Address</td>
              <td className="party-value" colSpan={3}>
                {order.shipping_address ||
                  [customer.address, customer.city, customer.state].filter(Boolean).join(', ') ||
                  '-'}
              </td>
            </tr>
            <tr>
              <td className="party-label">GSTIN / PAN</td>
              <td className="party-value" colSpan={3}>
                {customer.gstin || '-'} &nbsp;&nbsp; | &nbsp;&nbsp; PAN: {customer.pan || '-'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* ========== ITEMS / PARTICULARS ========== */}
        <div className="section-title">Particulars</div>
        <table className="items-table">
          <thead>
            <tr>
              <th className="sno">S.No.</th>
              <th className="particular">Particulars / Description</th>
              <th className="qty">Qty</th>
              <th className="rate">Rate</th>
              <th className="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={idx}>
                <td className="center">{idx + 1}</td>
                <td className="description">{item.name}</td>
                <td className="center">{item.qty}</td>
                <td className="number">{formatCurrency(item.price)}</td>
                <td className="number bold">{formatCurrency(item.qty * item.price)}</td>
              </tr>
            ))}
            {/* Empty rows (exactly 5 empty rows if fewer items) */}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`empty-${i}`} className="empty-row">
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}
            {/* Subtotal */}
            <tr className="subtotal-row">
              <td colSpan={4} className="subtotal-label">
                Sub Total
              </td>
              <td className="number">{formatCurrency(subtotal)}</td>
            </tr>
            {/* Net Total */}
            <tr className="net-total-row">
              <td colSpan={4} className="net-total-label">
                NET AMOUNT
              </td>
              <td className="net-total-value">{formatCurrency(total)}</td>
            </tr>
          </tbody>
        </table>

        {/* ========== PAYMENT SUMMARY ========== */}
        <table className="payment-summary">
          <tbody>
            <tr>
              <td className="words" rowSpan={3}>
                <div className="words-title">Amount in Words</div>
                <div className="words-value">INR {totalInWords} Only</div>
              </td>
              <td className="payment-label">Total Amount</td>
              <td className="payment-value">{formatCurrency(total)}</td>
            </tr>
            <tr>
              <td className="payment-label">Paid Amount</td>
              <td className="payment-value">{formatCurrency(paid)}</td>
            </tr>
            <tr>
              <td className="payment-label">Balance Due</td>
              <td className="payment-value">{formatCurrency(balance)}</td>
            </tr>
          </tbody>
        </table>

        {/* ========== BANK DETAILS + NARRATION ========== */}
        <table className="details-table">
          <tbody>
            <tr>
              <td>
                <div className="details-box">
                  <div className="details-title">Bank Details</div>
                  <div className="bank-line">
                    <strong>A/c Name:</strong> {company.bank_account_name || '-'}
                  </div>
                  <div className="bank-line">
                    <strong>Bank:</strong> {company.bank_name || '-'}
                  </div>
                  <div className="bank-line">
                    <strong>Branch:</strong> {company.bank_branch || '-'}
                  </div>
                  <div className="bank-line">
                    <strong>A/c No:</strong> {company.bank_account_no || '-'}
                  </div>
                  <div className="bank-line">
                    <strong>IFSC:</strong> {company.bank_ifsc || '-'}
                  </div>
                </div>
              </td>
              <td>
                <div className="details-box">
                  <div className="details-title">Notes / Narration</div>
                  <div className="narration">{order.notes || '-'}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ========== TERMS & CONDITIONS ========== */}
        <div className="terms">
          <div className="terms-title">Terms &amp; Conditions</div>
          {termsList.map((term, idx) => (
            <div key={idx} className="terms-line">
              {idx + 1}. {term}
            </div>
          ))}
        </div>

        {/* ========== SIGNATURE ========== */}
        <div className="signature">
          <div className="computer-generated">This is a Computer Generated Document.</div>
          <div className="signatory">
            <div className="for-company">For {company.name || 'Company'}</div>
            <div className="signature-line">Authorised Signatory</div>
          </div>
        </div>

        {/* ========== FOOTER ========== */}
        <div className="footer">Printed on {formatDate(new Date().toISOString())}</div>
      </div>

      {/* =====================================================
           CSS — identical to the provided HTML template
      ====================================================== */}
      <style>{`
        @page { size: A4; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { width: 100%; min-height: 100%; }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10.5px;
          color: #000;
          background: #e5e5e5;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 15px auto;
          background: #fff;
          border: 1px solid #000;
          padding: 8mm;
        }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; }
        .text-left { text-align: left; } .text-center { text-align: center; } .text-right { text-align: right; }
        .bold { font-weight: 700; } .uppercase { text-transform: uppercase; } .nowrap { white-space: nowrap; }

        .company-header {
          width: 100%; border: 1px solid #000; text-align: center; padding: 8px 10px; line-height: 1.4;
        }
        .company-name { font-size: 19px; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
        .company-address { font-size: 10.5px; }
        .company-contact { font-size: 10px; }
        .company-gstin { font-weight: 700; margin-top: 2px; }

        .document-title {
          border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000;
          text-align: center; padding: 6px; font-size: 13px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .4px;
        }

        .document-info { margin-top: 7px; }
        .document-info .label { width: 16%; font-weight: 700; background: #f3f3f3; white-space: nowrap; }
        .document-info .value { width: 34%; }

        .section-title {
          margin-top: 7px; border: 1px solid #000; border-bottom: none;
          padding: 5px 7px; font-weight: 700; background: #f3f3f3; text-transform: uppercase;
        }

        .party-table { width: 100%; }
        .party-label { width: 17%; font-weight: 700; background: #fafafa; white-space: nowrap; }
        .party-value { width: 33%; }

        .items-table { width: 100%; table-layout: fixed; }
        .items-table thead th { background: #f3f3f3; font-weight: 700; text-align: center; padding: 6px 4px; }
        .items-table .sno { width: 8%; } .items-table .particular { width: 47%; }
        .items-table .qty { width: 11%; } .items-table .rate { width: 17%; } .items-table .amount { width: 17%; }
        .items-table tbody td { height: 27px; }
        .items-table .description { text-align: left; font-weight: 600; }
        .items-table .number { text-align: right; white-space: nowrap; }
        .items-table .center { text-align: center; }
        .empty-row td { height: 25px; }

        .subtotal-row td { border-top: 2px solid #000; font-weight: 700; height: 30px; }
        .subtotal-label { text-align: right; }

        .net-total-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; height: 34px; }
        .net-total-label { text-align: right; font-size: 12px; font-weight: 700; }
        .net-total-value { text-align: right; font-size: 13px; font-weight: 700; white-space: nowrap; }

        .payment-summary { margin-top: 7px; }
        .payment-summary .words { width: 58%; vertical-align: top; padding: 8px; }
        .payment-summary .payment-label { width: 22%; font-weight: 700; background: #fafafa; }
        .payment-summary .payment-value { width: 20%; text-align: right; font-weight: 700; white-space: nowrap; }
        .words-title { font-weight: 700; text-transform: uppercase; margin-bottom: 5px; }
        .words-value { font-weight: 700; text-transform: capitalize; }

        .details-table { margin-top: 7px; }
        .details-table td { width: 50%; vertical-align: top; }
        .details-box { min-height: 105px; padding: 2px; }
        .details-title { font-weight: 700; text-transform: uppercase; text-decoration: underline; margin-bottom: 6px; }
        .bank-line { line-height: 1.55; }
        .narration { min-height: 75px; white-space: pre-line; }

        .terms {
          border: 1px solid #000; border-top: none; padding: 7px 8px; min-height: 70px;
        }
        .terms-title { font-weight: 700; text-transform: uppercase; text-decoration: underline; margin-bottom: 5px; }
        .terms-line { line-height: 1.5; }

        .signature {
          display: flex; justify-content: space-between; align-items: flex-end;
          border-left: 1px solid #000; border-right: 1px solid #000; border-bottom: 1px solid #000;
          min-height: 105px; padding: 8px;
        }
        .computer-generated { width: 55%; font-size: 9px; align-self: flex-end; }
        .signatory { width: 40%; text-align: right; }
        .for-company { font-weight: 700; margin-bottom: 32px; }
        .signature-line { border-top: 1px solid #000; padding-top: 4px; font-weight: 700; }

        .footer { text-align: center; font-size: 8px; color: #444; padding-top: 5px; }

        @media print {
          html, body { background: #fff; margin: 0; padding: 0; }
          .page { width: 100%; min-height: auto; margin: 0; padding: 5mm; border: 1px solid #000; }
          .items-table thead { display: table-header-group; }
          .items-table tr { page-break-inside: avoid; }
          .section-title, .party-table, .items-table, .payment-summary, .details-table, .terms, .signature {
            page-break-inside: avoid;
          }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
        }
        @media screen and (max-width: 900px) {
          .page { width: 100%; min-height: auto; margin: 0; padding: 10px; }
        }
      `}</style>
    </div>
  );
};

export default OrderPrint;