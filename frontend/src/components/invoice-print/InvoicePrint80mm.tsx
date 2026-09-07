import React from 'react';
import type { Invoice, Payment, InvoiceItem } from '../../types';

interface Props {
  invoice: Invoice;
}

const safeNumber = (val: any): number => {
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? 0 : num;
};

const InvoicePrint80mm: React.FC<Props> = ({ invoice }) => {
  const totalAmount = safeNumber(invoice.total_amount);
  const taxAmount = safeNumber(invoice.tax_amount);
  const discountAmount = safeNumber(invoice.discount_amount);
  const paidAmount = (invoice.payments || []).reduce(
    (s: number, p: Payment) => s + safeNumber(p.amount),
    0
  );
  const balance = totalAmount - paidAmount;

  // Extract company and branch information
  const company = invoice.company || {};
  const branch = invoice.branch || {};
  const customer = invoice.customer || {};

  // Billing address (invoice-level or customer-level)
  const billing = {
    street: invoice.billing_street || customer.billing_street || '',
    city: invoice.billing_city || customer.billing_city || '',
    state: invoice.billing_state || customer.billing_state || '',
    country: invoice.billing_country || customer.billing_country || '',
    pincode: invoice.billing_pincode || customer.billing_pincode || '',
  };

  return (
    <div className="thermal-80mm invoice-print-80mm">
      <style>{`
        .thermal-80mm {
          width: 80mm;
          max-width: 80mm;
          margin: 0 auto;
          padding: 3mm;
          font-size: 11px;
          line-height: 1.3;
          color: #000;
          background: #fff;
          font-family: 'Arial', sans-serif;
        }
        .thermal-80mm .center { text-align: center; }
        .thermal-80mm .bold { font-weight: bold; }
        .thermal-80mm .separator { border-top: 1px dashed #000; margin: 4px 0; }
        .thermal-80mm table.items { width: 100%; border-collapse: collapse; margin: 5px 0; }
        .thermal-80mm table.items th, .thermal-80mm table.items td { text-align: left; padding: 2px 0; }
        .thermal-80mm table.items .qty, .thermal-80mm table.items .rate, .thermal-80mm table.items .amount { text-align: right; }
        .thermal-80mm .totals { margin-top: 4px; }
        .thermal-80mm .totals .row { display: flex; justify-content: space-between; }
      `}</style>

      {/* Business Header - Dynamic */}
      <div className="center bold">
        {company.name && <div>{company.name}</div>}
        {company.address && <div>{company.address}</div>}
        {company.phone && <div>Phone: {company.phone}</div>}
        {company.gstin && <div>GSTIN: {company.gstin}</div>}
        {branch.name && (
          <>
            <div style={{ marginTop: '2px' }}>{branch.name}</div>
            {branch.address && <div>{branch.address}</div>}
            {branch.phone && <div>Phone: {branch.phone}</div>}
          </>
        )}
      </div>
      <div className="separator" />
      <div className="center bold">INVOICE</div>
      <div className="separator" />

      {/* Invoice Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>Invoice #: <span className="bold">{invoice.invoice_no}</span></div>
        <div>Date: {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : ''}</div>
      </div>

      {/* Customer */}
      <div className="separator" />
      <div className="bold">Bill To:</div>
      <div>{customer.name || 'Walk-in Customer'}</div>
      {billing.street && <div>{billing.street}</div>}
      {(billing.city || billing.state) && (
        <div>
          {billing.city}
          {billing.city && billing.state ? ', ' : ''}
          {billing.state}
        </div>
      )}
      {(billing.country || billing.pincode) && (
        <div>
          {billing.country}
          {billing.country && billing.pincode ? ' - ' : ''}
          {billing.pincode}
        </div>
      )}
      {customer.phone && <div>Ph: {customer.phone}</div>}
      {customer.email && <div>{customer.email}</div>}

      {/* Items */}
      <div className="separator" />
      <table className="items">
        <thead>
          <tr>
            <th>Product</th>
            <th className="qty">Qty</th>
            <th className="rate">Rate</th>
            <th className="amount">Amount</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items && invoice.items.length > 0 ? (
            invoice.items.map((item: InvoiceItem, idx: number) => (
              <tr key={idx}>
                <td style={{ wordBreak: 'break-word' }}>
                  {item.product?.name || `Product #${item.product_id}`}
                </td>
                <td className="qty">{item.quantity}</td>
                <td className="rate">{safeNumber(item.unit_price).toFixed(2)}</td>
                <td className="amount">{safeNumber(item.total).toFixed(2)}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan={4}>No items</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div className="separator" />
      <div className="totals">
        <div className="row">
          <span>Subtotal</span>
          <span>{(totalAmount - taxAmount + discountAmount).toFixed(2)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="row">
            <span>Discount</span>
            <span>-{discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="row">
          <span>Tax</span>
          <span>{taxAmount.toFixed(2)}</span>
        </div>
        <div className="separator" />
        <div className="row bold">
          <span>TOTAL</span>
          <span>{totalAmount.toFixed(2)}</span>
        </div>
        <div className="row">
          <span>Paid</span>
          <span>{paidAmount.toFixed(2)}</span>
        </div>
        <div className="row bold">
          <span>Balance</span>
          <span>{balance.toFixed(2)}</span>
        </div>
      </div>

      {/* Payment Status */}
      <div className="separator" />
      {balance <= 0 ? (
        <div className="center bold">** PAID **</div>
      ) : (
        <div className="center bold">BALANCE DUE: {balance.toFixed(2)}</div>
      )}

      {/* Footer */}
      <div className="separator" />
      <div className="center">Thank you for your business!</div>
      <div className="center">***</div>
    </div>
  );
};

export default InvoicePrint80mm;