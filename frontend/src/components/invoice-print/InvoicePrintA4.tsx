import React from 'react';
import type { Invoice } from '../../types';

interface Props {
  invoice: Invoice;
}

const safeNumber = (val: any): number => {
  const num = typeof val === 'number' ? val : parseFloat(val);
  return Number.isNaN(num) ? 0 : num;
};

const formatDate = (value: any): string => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

const InvoicePrintA4: React.FC<Props> = ({ invoice }) => {
  const totalAmount = safeNumber(invoice.total_amount);
  const taxAmount = safeNumber(invoice.tax_amount);
  const discountAmount = safeNumber(invoice.discount_amount);

  const paidAmount = (invoice.payments || []).reduce(
    (sum, payment) => sum + safeNumber(payment.amount),
    0
  );

  const balance = totalAmount - paidAmount;

  const company = (invoice as any).company || {};
  const branch = (invoice as any).branch || {};
  const customer = invoice.customer || {};

  const billing = {
    street:
      (invoice as any).billing_street ||
      customer.billing_street ||
      '',
    city:
      (invoice as any).billing_city ||
      customer.billing_city ||
      '',
    state:
      (invoice as any).billing_state ||
      customer.billing_state ||
      '',
    country:
      (invoice as any).billing_country ||
      customer.billing_country ||
      '',
    pincode:
      (invoice as any).billing_pincode ||
      customer.billing_pincode ||
      '',
  };

  const shipping = {
    street:
      (invoice as any).shipping_street ||
      customer.shipping_street ||
      '',
    city:
      (invoice as any).shipping_city ||
      customer.shipping_city ||
      '',
    state:
      (invoice as any).shipping_state ||
      customer.shipping_state ||
      '',
    country:
      (invoice as any).shipping_country ||
      customer.shipping_country ||
      '',
    pincode:
      (invoice as any).shipping_pincode ||
      customer.shipping_pincode ||
      '',
  };

  const gstin =
    (invoice as any).gstin ||
    customer.gstin ||
    '';

  const pan =
    (invoice as any).pan ||
    customer.pan ||
    '';

  const customerEmail = customer.email || '';

  const customerPhone =
    customer.phone ||
    customer.contact_no ||
    '';

  const hasShippingAddress =
    Boolean(
      shipping.street ||
      shipping.city ||
      shipping.state ||
      shipping.country ||
      shipping.pincode
    );

  /*
   * IMPORTANT:
   *
   * A4 physical size:
   * 210mm × 297mm
   *
   * We use:
   * @page { size: A4; margin: 0; }
   *
   * Then the invoice itself controls the printable margin.
   *
   * This prevents browser default margins from making the
   * invoice smaller or causing unexpected scaling.
   */

  return (
    <div className="invoice-print-a4">
      <style>{`
        /* =========================================================
           A4 PAGE CONFIGURATION
           ========================================================= */

        @page {
          size: A4 portrait;
          margin: 0;
        }

        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
        }

        /* =========================================================
           MAIN A4 CONTAINER
           ========================================================= */

        .invoice-print-a4 {
          width: 210mm;
          min-height: 297mm;

          margin: 0 auto;
          padding: 12mm;

          box-sizing: border-box;

          background: #ffffff;
          color: #1a202c;

          font-family:
            Arial,
            Helvetica,
            "Segoe UI",
            sans-serif;

          font-size: 12px;
          line-height: 1.4;

          overflow: hidden;
        }

        /* =========================================================
           SCREEN PREVIEW
           ========================================================= */

        @media screen {
          .invoice-print-a4 {
            width: 210mm;
            min-height: 297mm;

            margin: 20px auto;

            box-shadow:
              0 2px 12px rgba(0, 0, 0, 0.12);

            border: 1px solid #e2e8f0;
          }
        }

        /* =========================================================
           PRINT MODE
           ========================================================= */

        @media print {
          html,
          body {
            width: 210mm;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .invoice-print-a4 {
            width: 210mm !important;
            min-width: 210mm !important;
            max-width: 210mm !important;

            min-height: 297mm !important;

            margin: 0 !important;
            padding: 12mm !important;

            box-shadow: none !important;
            border: none !important;

            overflow: visible !important;
          }

          .invoice-print-a4 table {
            width: 100% !important;
          }

          .invoice-print-a4 .no-print {
            display: none !important;
          }
        }

        /* =========================================================
           HEADER
           ========================================================= */

        .invoice-print-a4 .header {
          width: 100%;

          display: flex;
          justify-content: space-between;
          align-items: flex-start;

          gap: 10mm;

          border-bottom: 0.5mm solid #2b6cb0;

          padding-bottom: 4mm;
          margin-bottom: 6mm;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .business-info {
          flex: 1 1 auto;
          min-width: 0;
        }

        .invoice-print-a4 .business-info h1 {
          margin: 0 0 2mm;

          font-size: 20px;
          line-height: 1.2;

          font-weight: 700;
        }

        .invoice-print-a4 .business-info p {
          margin: 0.5mm 0;

          font-size: 10px;
          line-height: 1.35;

          color: #4a5568;

          overflow-wrap: anywhere;
        }

        .invoice-print-a4 .invoice-info {
          flex: 0 0 55mm;

          text-align: right;

          min-width: 0;
        }

        .invoice-print-a4 .invoice-info h2 {
          margin: 0 0 2mm;

          font-size: 24px;
          line-height: 1.1;

          font-weight: 800;

          color: #2b6cb0;
        }

        .invoice-print-a4 .invoice-info p {
          margin: 0.7mm 0;

          font-size: 10px;
          line-height: 1.3;
        }

        /* =========================================================
           SECTIONS
           ========================================================= */

        .invoice-print-a4 .section {
          width: 100%;

          margin-bottom: 5mm;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .section h3 {
          margin: 0 0 2.5mm;

          font-size: 11px;
          line-height: 1.2;

          font-weight: 700;

          color: #2d3748;

          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        /* =========================================================
           BILL / SHIP ADDRESS
           ========================================================= */

        .invoice-print-a4 .address-row {
          width: 100%;

          display: flex;
          align-items: flex-start;

          gap: 8mm;

          margin-bottom: 6mm;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .address-box {
          flex: 1 1 50%;
          min-width: 0;

          padding: 3mm;

          border: 0.25mm solid #e2e8f0;
          border-radius: 1mm;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .address-box h4 {
          margin: 0 0 2mm;

          font-size: 10px;
          line-height: 1.2;

          font-weight: 700;

          color: #4a5568;

          text-transform: uppercase;
        }

        .invoice-print-a4 .address-box p {
          margin: 0 0 1mm;

          font-size: 9.5px;
          line-height: 1.35;

          overflow-wrap: anywhere;
        }

        /* =========================================================
           ITEMS TABLE
           ========================================================= */

        .invoice-print-a4 .items-table {
          width: 100%;

          table-layout: fixed;

          border-collapse: collapse;
          border-spacing: 0;

          margin: 0;

          page-break-inside: auto;
        }

        .invoice-print-a4 .items-table thead {
          display: table-header-group;
        }

        .invoice-print-a4 .items-table tfoot {
          display: table-footer-group;
        }

        .invoice-print-a4 .items-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .items-table th {
          background: #edf2f7;

          text-align: left;

          padding: 2.2mm 2mm;

          border: 0.25mm solid #cbd5e0;

          font-size: 9px;
          line-height: 1.2;

          font-weight: 700;

          color: #2d3748;
        }

        .invoice-print-a4 .items-table td {
          padding: 2mm;

          border-bottom: 0.25mm solid #e2e8f0;

          font-size: 9px;
          line-height: 1.3;

          vertical-align: top;

          overflow-wrap: anywhere;
          word-break: break-word;
        }

        /* Fixed column widths prevent overflow */

        .invoice-print-a4 .items-table th:nth-child(1),
        .invoice-print-a4 .items-table td:nth-child(1) {
          width: 9mm;
          text-align: center;
        }

        .invoice-print-a4 .items-table th:nth-child(2),
        .invoice-print-a4 .items-table td:nth-child(2) {
          width: auto;
          text-align: left;
        }

        .invoice-print-a4 .items-table th:nth-child(3),
        .invoice-print-a4 .items-table td:nth-child(3) {
          width: 18mm;
          text-align: right;
        }

        .invoice-print-a4 .items-table th:nth-child(4),
        .invoice-print-a4 .items-table td:nth-child(4) {
          width: 27mm;
          text-align: right;
        }

        .invoice-print-a4 .items-table th:nth-child(5),
        .invoice-print-a4 .items-table td:nth-child(5) {
          width: 30mm;
          text-align: right;
        }

        /* =========================================================
           TOTALS
           ========================================================= */

        .invoice-print-a4 .totals {
          width: 70mm;

          margin-left: auto;
          margin-top: 4mm;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .totals table {
          width: 100%;

          border-collapse: collapse;
          border-spacing: 0;
        }

        .invoice-print-a4 .totals td {
          padding: 1.2mm 0;

          border: none;

          font-size: 10px;
          line-height: 1.25;
        }

        .invoice-print-a4 .totals td:last-child {
          text-align: right;
          white-space: nowrap;
        }

        .invoice-print-a4 .totals .grand-total td {
          padding-top: 2.5mm;

          border-top: 0.5mm solid #2b6cb0;

          font-weight: 700;
          font-size: 12px;
        }

        /* =========================================================
           PAYMENT HISTORY
           ========================================================= */

        .invoice-print-a4 .payment-table {
          width: 100%;

          border-collapse: collapse;
          border-spacing: 0;

          table-layout: fixed;
        }

        .invoice-print-a4 .payment-table thead {
          display: table-header-group;
        }

        .invoice-print-a4 .payment-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .payment-table th {
          background: #edf2f7;

          padding: 2mm;

          border: 0.25mm solid #cbd5e0;

          text-align: left;

          font-size: 9px;
          font-weight: 700;
        }

        .invoice-print-a4 .payment-table td {
          padding: 2mm;

          border-bottom: 0.25mm solid #e2e8f0;

          font-size: 9px;
        }

        .invoice-print-a4 .payment-table th:last-child,
        .invoice-print-a4 .payment-table td:last-child {
          text-align: right;
        }

        /* =========================================================
           FOOTER
           ========================================================= */

        .invoice-print-a4 .footer {
          width: 100%;

          margin-top: 8mm;

          padding-top: 3mm;

          border-top: 0.25mm solid #cbd5e0;

          display: flex;
          justify-content: space-between;
          align-items: flex-start;

          gap: 10mm;

          font-size: 8.5px;
          line-height: 1.3;

          color: #718096;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .footer > div {
          flex: 1;
        }

        .invoice-print-a4 .footer > div:last-child {
          text-align: right;
        }

        /* =========================================================
           SIGNATURE
           ========================================================= */

        .invoice-print-a4 .signature {
          width: 55mm;

          margin-left: auto;
          margin-top: 15mm;

          text-align: center;

          font-size: 9px;
          line-height: 1.3;

          page-break-inside: avoid;
          break-inside: avoid;
        }

        .invoice-print-a4 .signature-line {
          display: block;

          width: 45mm;

          margin: 8mm auto 0;

          border-top: 0.25mm solid #a0aec0;
        }

        /* =========================================================
           PREVENT BAD PAGE BREAKS
           ========================================================= */

        .invoice-print-a4 h1,
        .invoice-print-a4 h2,
        .invoice-print-a4 h3,
        .invoice-print-a4 h4 {
          page-break-after: avoid;
          break-after: avoid;
        }

        .invoice-print-a4 .section,
        .invoice-print-a4 .address-row,
        .invoice-print-a4 .totals,
        .invoice-print-a4 .footer,
        .invoice-print-a4 .signature {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* =========================================================
           SMALL SCREEN
           ========================================================= */

        @media screen and (max-width: 850px) {
          .invoice-print-a4 {
            transform-origin: top left;
          }
        }

        /* =========================================================
           PRINT ONLY
           ========================================================= */

        @media print {
          .invoice-print-a4 .print-hidden,
          .invoice-print-a4 .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* =========================================================
          HEADER
          ========================================================= */}

      <div className="header">
        <div className="business-info">
          {company.name && (
            <h1>{company.name}</h1>
          )}

          {company.address && (
            <p>{company.address}</p>
          )}

          {company.phone && (
            <p>Phone: {company.phone}</p>
          )}

          {company.gstin && (
            <p>GSTIN: {company.gstin}</p>
          )}

          {branch.name && (
            <>
              <p
                style={{
                  marginTop: '2mm',
                  fontWeight: 700,
                }}
              >
                Branch: {branch.name}
              </p>

              {branch.address && (
                <p>{branch.address}</p>
              )}

              {branch.phone && (
                <p>Phone: {branch.phone}</p>
              )}
            </>
          )}
        </div>

        <div className="invoice-info">
          <h2>INVOICE</h2>

          <p>
            <strong>Invoice No:</strong>{' '}
            {invoice.invoice_no}
          </p>

          <p>
            <strong>Date:</strong>{' '}
            {formatDate(invoice.created_at)}
          </p>

          {invoice.due_date && (
            <p>
              <strong>Due Date:</strong>{' '}
              {formatDate(invoice.due_date)}
            </p>
          )}

          <p>
            <strong>Status:</strong>{' '}
            {invoice.status}
          </p>
        </div>
      </div>

      {/* =========================================================
          BILL TO / SHIP TO
          ========================================================= */}

      <div className="address-row">
        <div className="address-box">
          <h4>Bill To</h4>

          <p>
            <strong>
              {customer.name || 'Walk-in Customer'}
            </strong>
          </p>

          {billing.street && (
            <p>{billing.street}</p>
          )}

          {(billing.city || billing.state) && (
            <p>
              {billing.city}
              {billing.city && billing.state ? ', ' : ''}
              {billing.state}
            </p>
          )}

          {(billing.country || billing.pincode) && (
            <p>
              {billing.country}
              {billing.country && billing.pincode ? ' - ' : ''}
              {billing.pincode}
            </p>
          )}

          {gstin && (
            <p>GSTIN: {gstin}</p>
          )}

          {pan && (
            <p>PAN: {pan}</p>
          )}

          {customerEmail && (
            <p>Email: {customerEmail}</p>
          )}

          {customerPhone && (
            <p>Phone: {customerPhone}</p>
          )}
        </div>

        {hasShippingAddress && (
          <div className="address-box">
            <h4>Ship To</h4>

            <p>
              <strong>
                {customer.name || 'Walk-in Customer'}
              </strong>
            </p>

            {shipping.street && (
              <p>{shipping.street}</p>
            )}

            {(shipping.city || shipping.state) && (
              <p>
                {shipping.city}
                {shipping.city && shipping.state ? ', ' : ''}
                {shipping.state}
              </p>
            )}

            {(shipping.country || shipping.pincode) && (
              <p>
                {shipping.country}
                {shipping.country && shipping.pincode ? ' - ' : ''}
                {shipping.pincode}
              </p>
            )}
          </div>
        )}
      </div>

      {/* =========================================================
          ITEMS
          ========================================================= */}

      <div className="section">
        <h3>Items</h3>

        <table className="items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
            </tr>
          </thead>

          <tbody>
            {invoice.items && invoice.items.length > 0 ? (
              invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>

                  <td>
                    {item.product?.name ||
                      `Product #${item.product_id}`}
                  </td>

                  <td>
                    {item.quantity}
                  </td>

                  <td>
                    {safeNumber(item.unit_price).toFixed(2)}
                  </td>

                  <td>
                    {safeNumber(item.total).toFixed(2)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5}>
                  No items
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =========================================================
          TOTALS
          ========================================================= */}

      <div className="totals">
        <table>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td>
                {(
                  totalAmount -
                  taxAmount +
                  discountAmount
                ).toFixed(2)}
              </td>
            </tr>

            {discountAmount > 0 && (
              <tr>
                <td>Discount</td>
                <td>
                  -{discountAmount.toFixed(2)}
                </td>
              </tr>
            )}

            <tr>
              <td>Tax</td>
              <td>
                {taxAmount.toFixed(2)}
              </td>
            </tr>

            <tr className="grand-total">
              <td>Grand Total</td>
              <td>
                {totalAmount.toFixed(2)}
              </td>
            </tr>

            <tr>
              <td>Paid</td>
              <td>
                {paidAmount.toFixed(2)}
              </td>
            </tr>

            <tr>
              <td>Balance</td>
              <td>
                {balance.toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* =========================================================
          PAYMENT HISTORY
          ========================================================= */}

      {invoice.payments &&
        invoice.payments.length > 0 && (
          <div className="section">
            <h3>Payment History</h3>

            <table className="payment-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>

              <tbody>
                {invoice.payments.map(
                  (payment, index) => (
                    <tr key={index}>
                      <td>
                        {payment.reference_no || '-'}
                      </td>

                      <td>
                        {formatDate(
                          payment.created_at
                        )}
                      </td>

                      <td>
                        {payment.payment_method || '-'}
                      </td>

                      <td>
                        {safeNumber(
                          payment.amount
                        ).toFixed(2)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

      {/* =========================================================
          FOOTER
          ========================================================= */}

      <div className="footer">
        <div>
          Terms &amp; Conditions apply
        </div>

        <div>
          Thank you for your business!
        </div>
      </div>

      {/* =========================================================
          SIGNATURE
          ========================================================= */}

      <div className="signature">
        Authorized Signature

        <div className="signature-line" />
      </div>
    </div>
  );
};

export default InvoicePrintA4;