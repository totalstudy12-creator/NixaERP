import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FiArrowLeft, FiEdit2, FiPrinter, FiDownload, FiCheckCircle, FiPlus,
  FiClock, FiUser, FiMail, FiPhone, FiFileText, FiCreditCard, FiAlertCircle
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import { addAppLog } from '../services/appLogger';

// ---------- Types ----------
interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

interface InvoiceItem {
  id: number;
  product_id: number;
  product?: { name: string };
  quantity: number;
  unit_price: number;
  total: number;
}

interface Payment {
  id: number;
  reference_no: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface Invoice {
  id: number;
  invoice_no: string;
  company_id: number;
  customer_id: number;
  customer: Customer;
  total_amount: number | string;
  tax_amount: number | string;
  discount_amount?: number | string;
  status: 'paid' | 'pending' | 'overdue' | 'draft';
  due_date: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
  payments: Payment[];
}

// ---------- Helper ----------
const safeNumber = (val: any): number => {
  const num = typeof val === 'number' ? val : parseFloat(val);
  return isNaN(num) ? 0 : num;
};

// ---------- Status badge color config ----------
const statusConfig: Record<string, { bg: string; text: string; icon: JSX.Element }> = {
  paid: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    icon: <FiCheckCircle size={16} />,
  },
  pending: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    icon: <FiClock size={16} />,
  },
  overdue: {
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-700',
    icon: <FiAlertCircle size={16} />,
  },
  draft: {
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-700',
    icon: <FiFileText size={16} />,
  },
};

// ---------- Component ----------
export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payAmt, setPayAmt] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('manual');
  const [submitting, setSubmitting] = useState(false);

  const numericId = Number(id);
  const isValidId = id && !isNaN(numericId);

  const loadInvoice = useCallback(async () => {
    if (!isValidId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getInvoice(numericId);
      setInvoice(res);
    } catch (err: any) {
      console.error('Error loading invoice:', err);
      const msg = err.message || 'Unable to load invoice.';
      setError(msg);
      showError('Load failed', msg);
    } finally {
      setLoading(false);
    }
  }, [numericId, isValidId, showError]);

  useEffect(() => {
    if (isValidId) {
      loadInvoice();
    } else {
      setLoading(false);
      setError('Invalid invoice ID. Please check the URL.');
    }
  }, [isValidId, loadInvoice]);

  const totalAmount = useMemo(() => {
    if (!invoice) return 0;
    return safeNumber(invoice.total_amount);
  }, [invoice]);

  const taxAmount = useMemo(() => {
    if (!invoice) return 0;
    return safeNumber(invoice.tax_amount);
  }, [invoice]);

  const discountAmount = useMemo(() => {
    if (!invoice) return 0;
    return safeNumber(invoice.discount_amount);
  }, [invoice]);

  const paidAmount = useMemo(() => {
    if (!invoice) return 0;
    return (invoice.payments || []).reduce((sum, p) => sum + safeNumber(p.amount), 0);
  }, [invoice]);

  const remainingAmount = useMemo(() => {
    return totalAmount - paidAmount;
  }, [totalAmount, paidAmount]);

  const itemsTotal = useMemo(() => {
    if (!invoice?.items) return 0;
    return invoice.items.reduce((sum, item) => sum + safeNumber(item.total), 0);
  }, [invoice]);

  const isFullyPaid = useMemo(() => {
    return remainingAmount <= 0.01;
  }, [remainingAmount]);

  const createPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(payAmt);
    if (!payAmt || isNaN(amount) || amount <= 0) {
      showError('Validation', 'Please enter a valid payment amount.');
      return;
    }
    if (amount > remainingAmount) {
      showError('Validation', `Payment cannot exceed remaining amount: ₹${remainingAmount.toFixed(2)}`);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.createPayment({
        company_id: invoice.company_id,
        invoice_id: invoice.id,
        reference_no: 'PAY-' + Date.now(),
        amount: amount,
        payment_method: paymentMethod,
        status: 'completed',
      });
      showSuccess('Payment added', `₹${amount.toFixed(2)} recorded.`);
      addAppLog({
        module: 'Invoices',
        action: 'Add payment',
        status: 'success',
        message: `Added payment of ₹${amount.toFixed(2)} to invoice ${invoice.invoice_no}`,
      });
      setPayAmt('');
      await loadInvoice();
    } catch (err: any) {
      console.error('Error creating payment:', err);
      const msg = err.message || 'Payment failed.';
      showError('Payment failed', msg);
      addAppLog({
        module: 'Invoices',
        action: 'Add payment',
        status: 'error',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!invoice) return;
    if (isFullyPaid) {
      showSuccess('Already paid', 'This invoice is already fully paid.');
      return;
    }
    if (!confirm(`Mark invoice ${invoice.invoice_no} as paid? This will add a payment for the remaining amount.`)) {
      return;
    }
    const remaining = remainingAmount;
    if (remaining <= 0) return;

    setSubmitting(true);
    try {
      await apiClient.createPayment({
        company_id: invoice.company_id,
        invoice_id: invoice.id,
        reference_no: 'PAY-FULL-' + Date.now(),
        amount: remaining,
        payment_method: 'manual', // or the currently selected method
        status: 'completed',
      });
      await apiClient.updateInvoice(invoice.id, { status: 'paid' });
      showSuccess('Invoice marked as paid', `Full payment of ₹${remaining.toFixed(2)} recorded.`);
      addAppLog({
        module: 'Invoices',
        action: 'Mark invoice paid',
        status: 'success',
        message: `Marked invoice ${invoice.invoice_no} as paid`,
      });
      await loadInvoice();
    } catch (err: any) {
      const msg = err.message || 'Failed to mark as paid.';
      showError('Mark paid failed', msg);
      addAppLog({
        module: 'Invoices',
        action: 'Mark invoice paid',
        status: 'error',
        message: msg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    // For proper printing, integrate your InvoicePrint component.
    // For now, just trigger browser print – you'll see the current page.
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="animate-pulse max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
            <div className="h-8 bg-slate-200 rounded w-48"></div>
            <div className="h-6 bg-slate-200 rounded w-24 ml-auto"></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl p-5 shadow-sm">
                <div className="h-4 bg-slate-200 rounded w-16 mb-3"></div>
                <div className="h-6 bg-slate-200 rounded w-20"></div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
            <div className="h-6 bg-slate-200 rounded w-32"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-20 bg-slate-100 rounded"></div>
              <div className="h-20 bg-slate-100 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiAlertCircle size={28} className="text-rose-500" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Something went wrong</h2>
          <p className="text-slate-600 mb-6">{error || 'Invoice not found'}</p>
          <Link to="/invoices" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-medium transition">
            <FiArrowLeft size={16} /> Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  const status = invoice.status || 'draft';
  const statusStyle = statusConfig[status] || statusConfig.draft;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/invoices')}
              className="p-2 hover:bg-white rounded-xl transition"
              aria-label="Back to invoices"
            >
              <FiArrowLeft size={20} className="text-slate-600" />
            </button>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-800">Invoice {invoice.invoice_no}</h1>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${statusStyle.bg} ${statusStyle.text}`}>
                  {statusStyle.icon}
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Created {new Date(invoice.created_at).toLocaleDateString()} · Due {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 transition"
              aria-label="Print invoice"
            >
              <FiPrinter size={16} /> Print
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 transition"
              aria-label="Download PDF"
            >
              <FiDownload size={16} /> PDF
            </button>
            <Link
              to={`/invoices/${invoice.id}/edit`}
              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium flex items-center gap-2 transition"
              aria-label="Edit invoice"
            >
              <FiEdit2 size={16} /> Edit
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <FiFileText size={14} /> Total
            </div>
            <p className="text-xl font-bold text-slate-800">₹{totalAmount.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-emerald-600 text-sm mb-2">
              <FiCheckCircle size={14} /> Paid
            </div>
            <p className="text-xl font-bold text-emerald-600">₹{paidAmount.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-rose-500 text-sm mb-2">
              <FiAlertCircle size={14} /> Remaining
            </div>
            <p className={`text-xl font-bold ${remainingAmount > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
              ₹{remainingAmount.toFixed(2)}
            </p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <FiCreditCard size={14} /> Status
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.icon}
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
              <FiPlus size={14} /> Action
            </div>
            {!isFullyPaid && invoice.status !== 'paid' && (
              <button
                onClick={handleMarkAsPaid}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-sm font-medium hover:bg-emerald-100 transition disabled:opacity-50"
                aria-label="Mark invoice as paid"
              >
                <FiCheckCircle size={14} /> Mark Paid
              </button>
            )}
            {isFullyPaid && <p className="text-sm text-emerald-600 font-medium">Fully paid</p>}
            {!isFullyPaid && invoice.status === 'paid' && <p className="text-sm text-slate-500">Already paid</p>}
          </div>
        </div>

        {/* Invoice Details & Customer Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FiFileText className="text-blue-500" /> Invoice Details
            </h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Invoice Number</dt>
                <dd className="text-sm font-medium text-slate-700">{invoice.invoice_no}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Created At</dt>
                <dd className="text-sm text-slate-700">{new Date(invoice.created_at).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Due Date</dt>
                <dd className="text-sm text-slate-700">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Status</dt>
                <dd className={`text-sm font-medium ${statusStyle.text}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <FiUser className="text-indigo-500" /> Customer
            </h2>
            <div className="space-y-2">
              <p className="text-slate-700 font-medium">{invoice.customer?.name || '—'}</p>
              {invoice.customer?.email && (
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <FiMail size={14} /> {invoice.customer.email}
                </p>
              )}
              {invoice.customer?.phone && (
                <p className="text-sm text-slate-600 flex items-center gap-2">
                  <FiPhone size={14} /> {invoice.customer.phone}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-slate-800">Items</h2>
          </div>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-100">
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <td className="py-3 px-4 text-slate-700">{item.product?.name || `Product #${item.product_id}`}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{item.quantity}</td>
                      <td className="py-3 px-4 text-right text-slate-700">₹{safeNumber(item.unit_price).toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-medium text-slate-800">₹{safeNumber(item.total).toFixed(2)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <FiFileText size={32} className="mx-auto mb-2 opacity-30" />
                      No items found
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-medium">
                  <td colSpan={3} className="py-3 px-4 text-right text-slate-600">Items Total</td>
                  <td className="py-3 px-4 text-right font-bold text-slate-800">₹{itemsTotal.toFixed(2)}</td>
                </tr>
                <tr className="border-t-2 border-slate-300 font-bold">
                  <td colSpan={3} className="py-3 px-4 text-right text-slate-800">Grand Total</td>
                  <td className="py-3 px-4 text-right text-slate-800">₹{totalAmount.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payments Section */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-slate-800">Payments</h2>
          </div>
          <div className="p-6">
            {invoice.payments && invoice.payments.length > 0 ? (
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-100">
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                        <td className="py-3 px-4 text-slate-700">{p.reference_no}</td>
                        <td className="py-3 px-4 text-right font-medium text-slate-800">₹{safeNumber(p.amount).toFixed(2)}</td>
                        <td className="py-3 px-4 text-slate-600 capitalize">{p.payment_method}</td>
                        <td className="py-3 px-4 text-slate-600">{new Date(p.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="py-3 px-4 text-slate-700">Total Paid</td>
                      <td className="py-3 px-4 text-right text-emerald-600 font-bold">₹{paidAmount.toFixed(2)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <FiCreditCard size={32} className="mx-auto mb-2 opacity-30" />
                No payments recorded yet.
              </div>
            )}

            {/* Add Payment Form */}
            {!isFullyPaid && invoice.status !== 'paid' && (
              <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <h3 className="font-medium text-slate-700 mb-3">Record a Payment</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={payAmt}
                        onChange={(e) => setPayAmt(e.target.value)}
                        placeholder={`Enter amount (max ₹${remainingAmount.toFixed(2)})`}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition"
                        disabled={submitting}
                        aria-label="Payment amount"
                      />
                      <p className="text-xs text-slate-500 mt-1">Remaining: ₹{remainingAmount.toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none transition bg-white"
                        disabled={submitting}
                        aria-label="Payment method"
                      >
                        <option value="manual">Manual</option>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="online">Online Transfer</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="upi">UPI</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={createPayment}
                      disabled={submitting || !payAmt || parseFloat(payAmt) <= 0}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium flex items-center gap-2 transition disabled:opacity-50 whitespace-nowrap"
                      aria-label="Add payment"
                    >
                      <FiPlus size={16} /> {submitting ? 'Processing...' : 'Add Payment'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {isFullyPaid && (
              <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
                <FiCheckCircle size={18} /> This invoice is fully paid.
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}