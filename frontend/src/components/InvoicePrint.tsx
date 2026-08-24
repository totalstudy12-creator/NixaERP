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

interface Branch {
  id: number;
  name: string;
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
  product?: { name: string; hsn_sac_code?: string };
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
  branch?: Branch | null;
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
  total_amount?: number | string;
  tax_amount?: number | string;
  discount_amount?: number | string;
  status: string;
  due_date?: string | null;
  notes?: string;
  items?: InvoiceItem[];
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

  const num = (val: any): number => Number(val) || 0;

  // Normalize items
  const safeItems = (invoice.items ?? []).map((item, idx) => ({
    name: item.product?.name || item.product_name || `Product #${item.product_id || idx + 1}`,
    hsn: item.product?.hsn_sac_code || '',
    qty: num(item.quantity ?? item.qty),
    price: num(item.unit_price ?? item.price),
    tax_percent: num(item.igst_percent ?? item.tax_rate),
    discount_percent: num(item.discount_percent ?? 0),
    total: num(item.total),
  }));

  // Compute totals
  const subtotal = safeItems.reduce((sum, i) => sum + i.qty * i.price, 0);
  const totalDiscount = safeItems.reduce((sum, i) => sum + (i.qty * i.price * i.discount_percent) / 100, 0);
  const taxableValue = subtotal - totalDiscount;

  // Per-item tax
  const itemsWithTax = safeItems.map(item => {
    const base = item.qty * item.price;
    const discountAmount = (base * item.discount_percent) / 100;
    const taxable = base - discountAmount;
    const rate = item.tax_percent;
    const cgst = taxable * (rate / 2) / 100;
    const sgst = taxable * (rate / 2) / 100;
    return {
      ...item,
      taxable,
      cgst,
      sgst,
      totalTax: cgst + sgst,
    };
  });

  const totalCGST = itemsWithTax.reduce((sum, i) => sum + i.cgst, 0);
  const totalSGST = itemsWithTax.reduce((sum, i) => sum + i.sgst, 0);
  const totalTax = totalCGST + totalSGST;

  // Use backend-provided totals if available, else computed
  const finalTax = num(invoice.tax_amount) || totalTax;
  const finalTotal = num(invoice.total_amount) || taxableValue + finalTax;
  const paid = num(invoice.payment_received ?? invoice.payments?.reduce((sum, p) => sum + num(p.amount), 0));
  const balance = finalTotal - paid;

  const totalInWords = numberToWordsINR(finalTotal);
  const taxInWords = numberToWordsINR(finalTax);

  // Group by HSN for tax table
  const hsnGroups = itemsWithTax.reduce((acc, item) => {
    const hsn = item.hsn || '-';
    if (!acc[hsn]) {
      acc[hsn] = { hsn, taxable: 0, cgst: 0, sgst: 0 };
    }
    acc[hsn].taxable += item.taxable;
    acc[hsn].cgst += item.cgst;
    acc[hsn].sgst += item.sgst;
    return acc;
  }, {} as Record<string, { hsn: string; taxable: number; cgst: number; sgst: number }>);

  const hsnRows = Object.values(hsnGroups);

  // Company details
  const company = invoice.company || ({} as Company);
  const branchName = invoice.branch?.name || '';
  const sellerName = branchName ? `${company.name} - ${branchName}` : company.name;
  const sellerAddress = company.address || '';
  const sellerCity = company.city || '';
  const sellerState = company.state || '';
  const sellerPhone = company.phone || '';
  const sellerGST = company.gstin || '';

  // Customer / Buyer details
  const customer = invoice.customer || ({} as Customer);
  const buyerName = customer.name || invoice.customer_name || '-';
  const buyerAddress = customer.address || invoice.customer_address || '';
  const buyerCity = customer.city || '';
  const buyerState = customer.state || '';
  const buyerGST = customer.gstin || invoice.gstin || '';
  const buyerPhone = invoice.phone_no || '';

  return (
    <div ref={printRef} className="print-container">
      <div
        className="invoice-container"
        style={{
          width: '210mm',
          minHeight: '297mm',
          margin: '0 auto',
          padding: '10mm',
          boxSizing: 'border-box',
          background: 'white',
          color: '#000',
          fontFamily: 'Arial, sans-serif',
          fontSize: '12px',
          lineHeight: 1.2,
        }}
      >
        {/* Main invoice box */}
        <div style={{ border: '1px solid #000', display: 'flex', flexDirection: 'column' }}>
          {/* Top section: Addresses and Invoice Info */}
          <div style={{ display: 'flex', width: '100%' }}>
            {/* Left: Addresses */}
            <div style={{ width: '50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #000' }}>
              {/* Seller */}
              <div style={{ padding: '6px', borderBottom: '1px solid #000', minHeight: '100px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{sellerName || 'Your Company'}</div>
                {sellerAddress && <div>{sellerAddress}</div>}
                {sellerCity && <div>{sellerCity}</div>}
                {sellerState && <div>{sellerState}</div>}
                {sellerPhone && <div>Phone: {sellerPhone}</div>}
                {sellerGST && <div style={{ fontWeight: 'bold' }}>GSTIN/UIN: {sellerGST}</div>}
                {sellerState && <div>State Name : {sellerState}</div>}
              </div>

              {/* Consignee (Ship to) */}
              <div style={{ padding: '6px', borderBottom: '1px solid #000', minHeight: '100px' }}>
                <div>Consignee (Ship to)</div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{buyerName}</div>
                {buyerAddress && <div>{buyerAddress}</div>}
                {buyerCity && <div>{buyerCity}</div>}
                {buyerGST && <div>GSTIN/UIN : {buyerGST}</div>}
                {buyerState && <div>State Name : {buyerState}</div>}
              </div>

              {/* Buyer (Bill to) */}
              <div style={{ padding: '6px', minHeight: '100px' }}>
                <div>Buyer (Bill to)</div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{buyerName}</div>
                {buyerAddress && <div>{buyerAddress}</div>}
                {buyerCity && <div>{buyerCity}</div>}
                {buyerGST && <div>GSTIN/UIN : {buyerGST}</div>}
                {buyerState && <div>State Name : {buyerState}</div>}
              </div>
            </div>

            {/* Right: Invoice Info */}
            <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }}>
              {/* Invoice No & Date */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Invoice No.</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.invoice_no}</div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Dated</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-IN') : ''}</div>
                </div>
              </div>

              {/* Delivery Note & Mode/Terms */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Delivery Note</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.challan_no || ''}</div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Mode/Terms of Payment</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.payment_type || ''}</div>
                </div>
              </div>

              {/* Reference No & Other References */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Reference No. &amp; Date.</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.lr_no || ''}</div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Other References</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.eway_no || ''}</div>
                </div>
              </div>

              {/* Buyer's Order No & Dated */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Buyer's Order No.</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.po_no || ''}</div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Dated</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.po_date ? new Date(invoice.po_date).toLocaleDateString('en-IN') : ''}</div>
                </div>
              </div>

              {/* Dispatch Doc No & Delivery Note Date */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Dispatch Doc No.</div>
                  <div style={{ fontWeight: 'bold' }}></div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Delivery Note Date</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.challan_date ? new Date(invoice.challan_date).toLocaleDateString('en-IN') : ''}</div>
                </div>
              </div>

              {/* Dispatched through & Destination */}
              <div style={{ display: 'flex', minHeight: '48px' }}>
                <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
                  <div>Dispatched through</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.delivery_mode || ''}</div>
                </div>
                <div style={{ width: '50%', padding: '6px', borderBottom: '1px solid #000' }}>
                  <div>Destination</div>
                  <div style={{ fontWeight: 'bold' }}>{invoice.ship_to || ''}</div>
                </div>
              </div>

              {/* Terms of Delivery (flex-grow) */}
              <div style={{ padding: '6px', flexGrow: 1 }}>
                <div>Terms of Delivery</div>
                <div style={{ fontWeight: 'bold' }}>{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-IN') : ''}</div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div style={{ borderTop: '1px solid #000' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '4%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>SI<br />No.</th>
                  <th style={{ width: '32%', border: '1px solid #000', textAlign: 'left', fontWeight: 'normal', padding: '4px' }}>Description of Goods</th>
                  <th style={{ width: '10%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>HSN/SAC</th>
                  <th style={{ width: '10%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>GST %</th>
                  <th style={{ width: '6%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>Qty</th>
                  <th style={{ width: '9%', border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '4px' }}>Rate</th>
                  <th style={{ width: '10%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '4px' }}>Disc.</th>
                  <th style={{ width: '19%', border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '4px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {itemsWithTax.map((item, idx) => {
                  const lineTotal = item.qty * item.price;
                  const discountAmt = (lineTotal * item.discount_percent) / 100;
                  const afterDiscount = lineTotal - discountAmt;
                  return (
                    <React.Fragment key={idx}>
                      <tr>
                        <td style={{ border: '1px solid #000000', textAlign: 'center', padding: '4px' }}>{idx + 1}</td>
                        <td style={{ border: '1px solid #000000', textAlign: 'left', padding: '4px' }}>
                          <strong>{item.name}</strong>
                          {item.tax_percent > 0 && (
                            <>
                              <br /><br /><br /><br />
                              <span style={{ display: 'block', textAlign: 'right', fontStyle: 'italic' }}>CGST</span>
                              <span style={{ display: 'block', textAlign: 'right', fontStyle: 'italic' }}>SGST</span>
                            </>
                          )}
                        </td>
                        <td style={{ border: '1px solid #000', textAlign: 'center', padding: '4px' }}>{item.hsn || '-'}</td>
                        <td style={{ border: '1px solid #000', textAlign: 'center', padding: '4px' }}>{item.tax_percent}%</td>
                        <td style={{ border: '1px solid #000', textAlign: 'center', padding: '4px' }}>{item.qty}</td>
                        <td style={{ border: '1px solid #000', textAlign: 'right', padding: '4px' }}>₹{item.price.toFixed(2)}</td>
                        <td style={{ border: '1px solid #000', textAlign: 'center', padding: '4px' }}>{item.discount_percent > 0 ? `₹${discountAmt.toFixed(2)}` : '-'}</td>
                        <td style={{ border: '1px solid #000', textAlign: 'right', padding: '4px' }}>
                          <strong>₹{afterDiscount.toFixed(2)}</strong>
                          {item.tax_percent > 0 && (
                            <>
                              <br /><br /><br /><br />
                              <span>₹{item.cgst.toFixed(2)}</span><br />
                              <span>₹{item.sgst.toFixed(2)}</span>
                            </>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr>
                  <td colSpan={7} style={{ border: '1px solid #000', textAlign: 'left', fontWeight: 'bold', padding: '4px' }}>Sub-Total</td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'bold', padding: '4px' }}>₹{subtotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Amount Chargeable (in words) */}
          <div style={{ padding: '6px', borderTop: '1px solid #000' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
              <span>Amount Chargeable (in words)</span>
              <span style={{ fontStyle: 'italic' }}>E. &amp; O.E</span>
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Indian Rupee {totalInWords}</div>
          </div>

          {/* Tax Table */}
          <div style={{ borderTop: '1px solid #000' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ width: '20%', border: '1px solid #000', textAlign: 'left', fontWeight: 'normal', padding: '2px 4px' }}>HSN/SAC</th>
                  <th rowSpan={2} style={{ width: '20%', border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '2px 4px' }}>Taxable Value</th>
                  <th colSpan={2} style={{ width: '30%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '2px 4px' }}>Central Tax</th>
                  <th colSpan={2} style={{ width: '30%', border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '2px 4px' }}>State Tax</th>
                  <th rowSpan={2} style={{ width: '20%', border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '2px 4px' }}>Total Tax Amount</th>
                </tr>
                <tr>
                  <th style={{ border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '2px 4px' }}>Rate</th>
                  <th style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '2px 4px' }}>Amount</th>
                  <th style={{ border: '1px solid #000', textAlign: 'center', fontWeight: 'normal', padding: '2px 4px' }}>Rate</th>
                  <th style={{ border: '1px solid #000', textAlign: 'right', fontWeight: 'normal', padding: '2px 4px' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnRows.map((row, idx) => {
                  const rate = (row.cgst > 0 || row.sgst > 0) ? 9 : 0; // simplified; could be dynamic based on item tax_percent
                  return (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', textAlign: 'left', padding: '2px 4px' }}>{row.hsn}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{row.taxable.toFixed(2)}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 4px' }}>{rate}%</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{row.cgst.toFixed(2)}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 4px' }}>{rate}%</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{row.sgst.toFixed(2)}</td>
                      <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{(row.cgst + row.sgst).toFixed(2)}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 'bold' }}>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>Total</td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{taxableValue.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 4px' }}></td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{totalCGST.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', textAlign: 'center', padding: '2px 4px' }}></td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{totalSGST.toFixed(2)}</td>
                  <td style={{ border: '1px solid #000', textAlign: 'right', padding: '2px 4px' }}>{finalTax.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax Amount in Words */}
          <div style={{ padding: '6px', borderTop: '1px solid #000', display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: '8px', fontSize: '13px' }}>Tax Amount (in words) :</span>
            <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Indian Rupee {taxInWords}</span>
          </div>

          {/* Footer / Declaration */}
          <div style={{ display: 'flex', borderTop: '1px solid #000' }}>
            <div style={{ width: '50%', padding: '6px', borderRight: '1px solid #000', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ textDecoration: 'underline', fontSize: '13px', marginBottom: '4px' }}>Declaration</div>
                <p style={{ fontSize: '13px' }}>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</p>
              </div>
            </div>
            <div style={{ width: '50%', padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', position: 'relative', minHeight: '100px' }}>
              <div style={{ fontWeight: 'bold', fontSize: '13px' }}>for {sellerName}</div>
              <div style={{ position: 'absolute', bottom: '6px', right: '6px' }}>Authorised Signatory</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px' }}>
          This is a Computer Generated Invoice
        </div>
      </div>

      {/* Print-specific styles */}
      <style>{`
        .print-container {
          display: none;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .print-container, .print-container * {
            visibility: visible;
          }
          .print-container {
            display: block;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .invoice-container {
            box-shadow: none !important;
            margin: 0 !important;
            padding: 10mm !important;
            width: 210mm !important;
            min-height: 297mm !important;
          }
        }
      `}</style>
    </div>
  );
};

export default InvoicePrint;