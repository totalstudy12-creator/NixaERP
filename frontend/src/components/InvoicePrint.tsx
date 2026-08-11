import React, { useEffect, useRef } from 'react';

// ---------- Types ----------
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
  pan?: string;
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
}

interface InvoiceItem {
  product_id?: number;
  product_name?: string;
  product?: { name: string };
  quantity?: number;
  qty?: number;
  unit_price?: number;
  price?: number;
  igst_percent?: number;
  tax_rate?: number;
  discount_percent?: number;
  total?: number;
}

interface Invoice {
  id: number;
  invoice_no: string;
  company?: Company;
  customer?: Customer;
  customer_name?: string;
  customer_address?: string;
  contact_person?: string;
  phone_no?: string;
  gstin?: string;
  pan?: string;
  reverse_charge?: boolean;
  ship_to?: string;
  place_of_supply?: string;
  invoice_type?: string;
  invoice_date?: string;
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
  bank_id?: number;
  packing_charges?: number | string;
  general_discount_percent?: number;
  general_discount_amount?: number;
  round_off?: number;
  total_amount: number | string;
  tax_amount: number | string;
  discount_amount?: number | string;
  status: string;
  due_date?: string;
  notes?: string;
  items: InvoiceItem[];
  payments?: { amount: number | string }[];
}

interface Props {
  invoice: Invoice;
  onReady?: () => void;
}

// ---------- Number to Words (Indian currency) ----------
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

// ---------- Component ----------
const InvoicePrint: React.FC<Props> = ({ invoice, onReady }) => {
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onReady) onReady();
  }, [onReady]);

  // Helper to safely convert any value to number
  const num = (val: any): number => Number(val) || 0;

  // Normalize items
  const safeItems = invoice.items.map((item, idx) => ({
    name: item.product?.name || item.product_name || `Product #${item.product_id || idx + 1}`,
    qty: num(item.quantity ?? item.qty),
    price: num(item.unit_price ?? item.price),
    igst_percent: num(item.igst_percent ?? item.tax_rate),
    discount_percent: num(item.discount_percent ?? 0),
    total: num(item.total),
  }));

  // Totals
  const subtotal = safeItems.reduce((sum, i) => sum + i.qty * i.price, 0);
  const totalDiscount = safeItems.reduce((sum, i) => sum + (i.qty * i.price * i.discount_percent) / 100, 0);
  const taxableValue = subtotal - totalDiscount;
  const igstTotal = safeItems.reduce((sum, i) => sum + (taxableValue * i.igst_percent) / 100, 0); // simplified, should be per item
  // More accurate per item
  let accurateIgstTotal = 0;
  safeItems.forEach(i => {
    const base = i.qty * i.price;
    const disc = base * i.discount_percent / 100;
    const taxable = base - disc;
    accurateIgstTotal += taxable * i.igst_percent / 100;
  });
  const tax = num(invoice.tax_amount) || accurateIgstTotal;
  const total = num(invoice.total_amount) || taxableValue + tax;
  const paid = num(invoice.payment_received ?? invoice.payments?.reduce((sum, p) => sum + num(p.amount), 0));
  const balance = total - paid;

  const totalInWords = numberToWordsINR(total);

  // Tax breakdown (assume 9% CGST + 9% SGST = 18% IGST, but we show as per template)
  const cgst = tax / 2;
  const sgst = tax / 2;

  return (
    <div ref={printRef} className="print-container">
      <div className="invoice-container">
        {/* HEADER TITLE */}
        <div className="header-title">TAX INVOICE</div>

        {/* HEADER GRID */}
        <div className="header-grid">
          <div className="header-left">
            <div className="font-bold" style={{ fontSize: '14px' }}>
              {invoice.company?.name || 'Your Company Name'}
            </div>
            {invoice.company?.address && <div>{invoice.company.address}</div>}
            {invoice.company?.city && <div>{invoice.company.city}</div>}
            {invoice.company?.state && <div>{invoice.company.state}</div>}
            {invoice.company?.phone && <div>Phone : {invoice.company.phone}</div>}
            {invoice.company?.email && <div>Email: {invoice.company.email}</div>}
            {invoice.company?.gstin && <div className="font-bold">GSTIN : {invoice.company.gstin}</div>}
            {invoice.company?.pan && <div className="font-bold">PAN : {invoice.company.pan}</div>}
          </div>

          <div className="header-right">
            <table>
              <tbody>
                <tr>
                  <td className="label">Invoice No.</td>
                  <td className="value"><strong>{invoice.invoice_no}</strong></td>
                  <td className="label">Date</td>
                  <td className="value"><strong>{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-IN') : '-'}</strong></td>
                </tr>
                <tr>
                  <td className="label">e-Way Bill No.</td>
                  <td className="value">{invoice.eway_no || ''}</td>
                  <td className="label">Date</td>
                  <td className="value"></td>
                </tr>
                <tr>
                  <td className="label">Delivery Note No.</td>
                  <td className="value">{invoice.challan_no || ''}</td>
                  <td className="label">Delivery Date</td>
                  <td className="value">{invoice.challan_date ? new Date(invoice.challan_date).toLocaleDateString('en-IN') : ''}</td>
                </tr>
                <tr>
                  <td className="label">Buyer Order No.</td>
                  <td className="value">{invoice.po_no || ''}</td>
                  <td className="label">Order Date</td>
                  <td className="value">{invoice.po_date ? new Date(invoice.po_date).toLocaleDateString('en-IN') : ''}</td>
                </tr>
                <tr>
                  <td className="label">Desp Doc No.</td>
                  <td className="value"></td>
                  <td className="label">Mode Of Payment</td>
                  <td className="value">{invoice.payment_type || ''}</td>
                </tr>
                <tr>
                  <td className="label">Desp Doc</td>
                  <td className="value"></td>
                  <td className="label">Terms of Pmt</td>
                  <td className="value">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN') : ''}</td>
                </tr>
                <tr>
                  <td className="label">Despatched Through</td>
                  <td className="value">{invoice.delivery_mode || ''}</td>
                  <td className="label">Destination</td>
                  <td className="value">{invoice.ship_to || ''}</td>
                </tr>
                <tr>
                  <td className="label">Dis Thru</td>
                  <td className="value"></td>
                  <td className="label">Destin</td>
                  <td className="value"></td>
                </tr>
                <tr>
                  <td className="label">LRR-RNo.</td>
                  <td className="value">{invoice.lr_no || ''}</td>
                  <td className="label">Vehicle No.</td>
                  <td className="value"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* BUYER SECTION */}
        <div className="buyer-section">
          <div className="font-bold">Buyer:</div>
          {invoice.customer ? (
            <>
              <div className="font-bold">{invoice.customer.name}</div>
              {invoice.customer.address && <div>{invoice.customer.address}</div>}
              {invoice.customer.city && <div>{invoice.customer.city}</div>}
              {invoice.customer.state && <div>State : {invoice.customer.state}</div>}
              {invoice.customer.gstin && <div className="font-bold">GSTIN : {invoice.customer.gstin}</div>}
            </>
          ) : (
            <>
              <div className="font-bold">{invoice.customer_name || '-'}</div>
              {invoice.customer_address && <div>{invoice.customer_address}</div>}
              {invoice.gstin && <div className="font-bold">GSTIN : {invoice.gstin}</div>}
            </>
          )}
        </div>

        {/* ITEMS TABLE */}
        <table className="main-table">
          <thead>
            <tr>
              <th style={{ width: '4%' }}>S.<br />No</th>
              <th style={{ width: '32%' }}>Description</th>
              <th style={{ width: '10%' }}>HSN/SAC</th>
              <th style={{ width: '10%' }}>GST %</th>
              <th style={{ width: '6%' }}>Qty</th>
              <th style={{ width: '9%' }}>Rate</th>
              <th style={{ width: '10%' }}>Discount</th>
              <th style={{ width: '19%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {safeItems.map((item, idx) => {
              const lineTotal = item.qty * item.price;
              const discountAmt = (lineTotal * item.discount_percent) / 100;
              const afterDiscount = lineTotal - discountAmt;
              const igstAmt = (afterDiscount * item.igst_percent) / 100;
              const finalTotal = afterDiscount + igstAmt;
              return (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td className="desc-col"><strong>{item.name}</strong></td>
                  <td>-</td>
                  <td>{item.igst_percent}%</td>
                  <td>{item.qty}</td>
                  <td>₹{item.price.toFixed(2)}</td>
                  <td>{item.discount_percent > 0 ? `₹${discountAmt.toFixed(2)}` : '-'}</td>
                  <td className="amt-col">₹{finalTotal.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr className="subtotal-row">
              <td colSpan={7} className="text-left font-bold">Sub-Total</td>
              <td className="text-right amt-col">₹{subtotal.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* FOOTER SUMMARY */}
        <div className="footer-top">
          <div className="footer-left">
            <div className="label-block">Total Amount (In Words)</div>
            <div><strong>INR {totalInWords}</strong></div>

            <div className="label-block">Bank NEFT Details</div>
            {invoice.company ? (
              <table style={{ border: 'none', width: 'auto' }}>
                <tbody>
                  <tr><td style={{ border: 'none', padding: '2px 0', width: '130px' }}>Account Name</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>{invoice.company.bank_account_name || '-'}</strong></td></tr>
                  <tr><td style={{ border: 'none', padding: '2px 0' }}>Bank Name</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>{invoice.company.bank_name || '-'}</strong></td></tr>
                  <tr><td style={{ border: 'none', padding: '2px 0' }}>Branch</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>{invoice.company.bank_branch || '-'}</strong></td></tr>
                  <tr><td style={{ border: 'none', padding: '2px 0' }}>A/c No.</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>{invoice.company.bank_account_no || '-'}</strong></td></tr>
                  <tr><td style={{ border: 'none', padding: '2px 0' }}>IFS Code</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>{invoice.company.bank_ifsc || '-'}</strong></td></tr>
                </tbody>
              </table>
            ) : (
              <div>No bank details available</div>
            )}

            <div className="label-block" style={{ marginTop: '15px' }}>Payment Summary</div>
            <table style={{ border: 'none', width: 'auto' }}>
              <tbody>
                <tr><td style={{ border: 'none', padding: '2px 0', width: '130px' }}>Paid Amount</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>₹{paid.toFixed(2)}</strong></td></tr>
                <tr><td style={{ border: 'none', padding: '2px 0' }}>Balance Due</td><td style={{ border: 'none', padding: '2px 0' }}>: <strong>₹{balance.toFixed(2)}</strong></td></tr>
              </tbody>
            </table>
          </div>

          <div className="footer-right">
            <div style={{ display: 'flex', padding: '2px 6px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
              <div style={{ width: '60%' }}>Output CGST</div>
              <div style={{ width: '40%' }}></div>
            </div>
            <div style={{ display: 'flex', padding: '2px 6px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
              <div style={{ width: '60%' }}>Output SGST</div>
              <div style={{ width: '40%' }}></div>
            </div>
            <div style={{ display: 'flex', padding: '2px 6px', borderBottom: '1px solid #000', fontWeight: 'bold' }}>
              <div style={{ width: '60%' }}>Round Off</div>
              <div style={{ width: '40%' }}>₹{num(invoice.round_off).toFixed(2)}</div>
            </div>

            <table className="rate-amt-table">
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: '20%' }}>Taxable<br />Value</th>
                  <th colSpan={2} style={{ width: '30%' }}>Central Tax</th>
                  <th colSpan={2} style={{ width: '30%' }}>State Tax</th>
                  <th rowSpan={2} style={{ width: '20%' }}>Total<br />Tax Amount</th>
                </tr>
                <tr>
                  <th style={{ width: '50%' }}>Rate</th>
                  <th style={{ width: '50%' }}>Amount</th>
                  <th style={{ width: '50%' }}>Rate</th>
                  <th style={{ width: '50%' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="amt-right">₹{taxableValue.toFixed(2)}</td>
                  <td>9%</td>
                  <td className="amt-right">₹{cgst.toFixed(2)}</td>
                  <td>9%</td>
                  <td className="amt-right">₹{sgst.toFixed(2)}</td>
                  <td className="amt-right">₹{tax.toFixed(2)}</td>
                </tr>
                <tr style={{ fontWeight: 'bold' }}>
                  <td className="amt-right">Total:</td>
                  <td></td>
                  <td className="amt-right">₹{cgst.toFixed(2)}</td>
                  <td></td>
                  <td className="amt-right">₹{sgst.toFixed(2)}</td>
                  <td className="amt-right">₹{tax.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div className="grand-total-row">
              <span>GRAND TOTAL</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* BOTTOM FOOTER */}
        <div className="bottom-footer">
          <div className="footer-left-legal">
            <div>Subject to our Jurisdiction.</div>
            <div style={{ fontSize: '11px' }}>This is a Computer Generated Invoice. No Seal & Signature Required.</div>
          </div>
          <div className="footer-right-sig">
            <div className="font-bold">For {invoice.company?.name || 'Your Company'}</div>
            <div style={{ marginTop: '25px' }}>Authorised Signatory</div>
          </div>
        </div>
      </div>

      {/* Embedded CSS (exact Tally style, scoped to print) */}
      <style>{`
        /* --- A4 Base Reset & Print Settings --- */
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            background-color: #e6e6e6;
            display: flex;
            justify-content: center;
            padding: 20px;
        }

        .invoice-container {
            width: 210mm;
            min-height: 297mm;
            background: #fff;
            padding: 15px;
            border: 1px solid #ccc;
            box-shadow: 0 0 15px rgba(0,0,0,0.1);
            position: relative;
        }

        .text-left { text-align: left; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .font-bold { font-weight: bold; }
        .v-top { vertical-align: top; }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        td, th {
            padding: 5px 6px;
        }

        .header-title {
            font-size: 18px;
            font-weight: bold;
            text-align: center;
            padding: 10px 0;
            border: 1px solid #000;
            border-bottom: none;
            letter-spacing: 1px;
        }

        .header-grid {
            border: 1px solid #000;
            display: flex;
            flex-wrap: wrap;
        }

        .header-left {
            width: 34%;
            border-right: 1px solid #000;
            padding: 6px 10px;
            line-height: 1.6;
        }

        .header-right {
            width: 66%;
            padding: 0;
        }

        .header-right table td {
            border: 1px solid #000;
            padding: 5px 6px;
            vertical-align: top;
        }
        .header-right table .label {
            font-weight: bold;
            white-space: nowrap;
            width: 22%;
            background-color: #f9f9f9;
        }
        .header-right table .value {
            font-weight: normal;
            width: 28%;
        }

        .buyer-section {
            border: 1px solid #000;
            border-top: none;
            padding: 6px 10px;
            line-height: 1.6;
            width: 34%;
        }

        .main-table th {
            background-color: #fff;
            font-weight: bold;
            text-align: center;
            border: 1px solid #000;
            padding: 6px;
        }
        
        .main-table td {
            text-align: center;
            border-left: 1px solid #000;
            border-right: 1px solid #000;
            border-top: none;
            border-bottom: none;
            padding: 6px;
        }
        .main-table .desc-col {
            text-align: left;
            padding-left: 10px;
        }
        .main-table .amt-col {
            text-align: right;
        }

        .main-table tbody tr:first-child td {
            border-top: 1px solid #000;
        }
        .main-table .subtotal-row td {
            border-top: 2px solid #000;
            border-bottom: 1px solid #000;
        }

        .footer-top {
            display: flex;
            border: 1px solid #000;
            border-top: none;
        }

        .footer-left {
            width: 54%;
            padding: 6px 10px;
            border-right: 1px solid #000;
            line-height: 1.6;
        }

        .footer-left .label-block {
            font-weight: bold;
            display: block;
            margin-top: 12px;
        }
        .footer-left .label-block:first-child {
            margin-top: 0;
        }

        .footer-right {
            width: 46%;
            padding: 0;
            vertical-align: top;
        }

        .footer-right table {
            border: none;
            width: 100%;
        }
        .footer-right td {
            border: none;
            padding: 3px 6px;
        }
        .footer-right .rate-amt-table td {
            border: 1px solid #000;
            text-align: center;
        }
        .footer-right .rate-amt-table th {
            border: 1px solid #000;
            text-align: center;
            font-weight: bold;
        }
        .footer-right .rate-amt-table .amt-right {
            text-align: right;
        }

        .grand-total-row {
            display: flex;
            justify-content: space-between;
            border-top: 1px solid #000;
            padding: 5px 10px;
            font-weight: bold;
            font-size: 14px;
        }

        .bottom-footer {
            display: flex;
            justify-content: space-between;
            border: 1px solid #000;
            border-top: none;
            padding: 10px 10px;
            align-items: flex-end;
        }
        
        .bottom-footer .footer-left-legal {
            width: 60%;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            gap: 12px;
        }
        .bottom-footer .footer-right-sig {
            width: 40%;
            text-align: right;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
        }

        /* Print specific */
        @media print {
            body {
                background: none;
                padding: 0;
                margin: 0;
            }
            .invoice-container {
                width: 100%;
                min-height: auto;
                border: none;
                box-shadow: none;
                padding: 10px;
                margin: 0;
            }
            .print-container {
                display: block;
                position: absolute;
                left: 0;
                top: 0;
            }
        }

        .print-container {
            display: none;
        }

        @media print {
            .print-container {
                display: block;
            }
            body * {
                visibility: hidden;
            }
            .print-container, .print-container * {
                visibility: visible;
            }
        }
      `}</style>
    </div>
  );
};

export default InvoicePrint;