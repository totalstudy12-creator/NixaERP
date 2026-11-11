import React, { useEffect } from 'react';
import BulkInvoicePrint, { PrintableInvoice } from './BulkInvoicePrint';

interface Props {
  invoice: PrintableInvoice;
  onReady?: () => void;
}

export const InvoicePrint: React.FC<Props> = ({ invoice, onReady }) => {
  useEffect(() => {
    if (!invoice) return;
    const timer = setTimeout(() => {
      window.print();
      onReady?.();
    }, 400);
    return () => clearTimeout(timer);
  }, [invoice, onReady]);

  if (!invoice) return null;

  return (
    <BulkInvoicePrint
      invoices={[invoice]}
      onReady={onReady}
    />
  );
};

export default InvoicePrint;
