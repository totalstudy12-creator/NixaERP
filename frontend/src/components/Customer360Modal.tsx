import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiX, FiUser, FiMail, FiPhone, FiMapPin, FiCalendar, FiDollarSign,
  FiShoppingBag, FiFileText, FiCreditCard, FiClock, FiActivity,
  FiCheckCircle, FiAlertTriangle, FiPrinter, FiDownload, FiArchive,
  FiRotateCcw, FiLayers, FiPackage, FiMessageSquare, FiShield, FiTag,
  FiExternalLink
} from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from './NotificationContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Customer360ModalProps {
  customerId: number | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomerUpdated?: () => void;
}

type TabType =
  | 'overview'
  | 'quotations'
  | 'sales'
  | 'payments'
  | 'outstanding'
  | 'products'
  | 'addresses'
  | 'contacts'
  | 'activities'
  | 'documents'
  | 'communication'
  | 'audit';

export function Customer360Modal({
  customerId,
  isOpen,
  onClose,
  onCustomerUpdated,
}: Customer360ModalProps) {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadCustomer360 = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const res = await apiClient.getCustomer360(customerId);
      if (res && res.data) {
        setData(res.data);
      }
    } catch (err: any) {
      showError('Error', err?.message || 'Failed to load Customer 360 data.');
    } finally {
      setLoading(false);
    }
  }, [customerId, showError]);

  useEffect(() => {
    if (isOpen && customerId) {
      loadCustomer360();
    } else {
      setData(null);
      setActiveTab('overview');
    }
  }, [isOpen, customerId, loadCustomer360]);

  const handleToggleArchive = async () => {
    if (!customerId) return;
    setActionLoading(true);
    try {
      const res = await apiClient.toggleCustomerArchive(customerId);
      showSuccess('Success', res.message || 'Customer status updated.');
      loadCustomer360();
      onCustomerUpdated?.();
    } catch (err: any) {
      showError('Error', err?.message || 'Failed to toggle archive status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintStatement = () => {
    window.print();
  };

  if (!isOpen) return null;

  const customer = data?.customer;
  const kpis = data?.kpis || {};
  const quotations = data?.quotations || [];
  const invoices = data?.invoices || [];
  const orders = data?.orders || [];
  const returns = data?.returns || [];
  const payments = data?.payments || [];
  const products = data?.products || [];
  const contacts = data?.contacts || [];
  const activities = data?.activities || [];
  const auditLogs = data?.audit_logs || [];
  const aging = kpis.aging || { current: 0, days_30: 0, days_60: 0, days_90_plus: 0 };

  const tabs: Array<{ id: TabType; label: string; icon: any; count?: number }> = [
    { id: 'overview', label: 'Overview', icon: FiLayers },
    { id: 'quotations', label: 'Quotations', icon: FiFileText, count: quotations.length },
    { id: 'sales', label: 'Sales & Invoices', icon: FiShoppingBag, count: invoices.length },
    { id: 'payments', label: 'Payments', icon: FiCreditCard, count: payments.length },
    { id: 'outstanding', label: 'Outstanding Aging', icon: FiClock },
    { id: 'products', label: 'Products Purchased', icon: FiPackage, count: products.length },
    { id: 'addresses', label: 'Addresses', icon: FiMapPin },
    { id: 'contacts', label: 'Contacts', icon: FiUser, count: contacts.length },
    { id: 'activities', label: 'Activities & Notes', icon: FiActivity, count: activities.length },
    { id: 'communication', label: 'Communication', icon: FiMessageSquare },
    { id: 'audit', label: 'Audit History', icon: FiShield, count: auditLogs.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative flex h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md font-bold text-lg">
              {(customer?.name || 'C').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-slate-900">
                  {customer?.name || 'Customer 360 Workspace'}
                </h2>
                <Badge variant={customer?.is_active ? 'default' : 'secondary'} className={customer?.is_active ? 'bg-emerald-500' : 'bg-slate-400'}>
                  {customer?.is_active ? 'Active' : 'Archived'}
                </Badge>
                <Badge variant="outline" className="text-slate-600 uppercase text-[11px] font-mono">
                  {customer?.type || 'Customer'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Code: <span className="font-mono text-slate-700 font-semibold">#{customer?.id}</span> • Registered: {customer?.created_at ? new Date(customer.created_at).toLocaleDateString() : 'N/A'}
                {customer?.company?.name && ` • Company: ${customer.company.name}`}
                {kpis.last_visit_date && ` • Last Visit: ${new Date(kpis.last_visit_date).toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintStatement}
              className="flex items-center gap-1.5 text-xs text-slate-700"
            >
              <FiPrinter className="h-3.5 w-3.5" /> Print Statement
            </Button>
            <Button
              variant={customer?.is_active ? 'outline' : 'default'}
              size="sm"
              onClick={handleToggleArchive}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-xs"
            >
              {customer?.is_active ? (
                <>
                  <FiArchive className="h-3.5 w-3.5 text-amber-600" /> Archive
                </>
              ) : (
                <>
                  <FiRotateCcw className="h-3.5 w-3.5" /> Restore
                </>
              )}
            </Button>
            <button
              onClick={onClose}
              className="ml-2 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            >
              <FiX className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 px-6 scrollbar-thin">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              <p className="text-sm text-slate-500">Loading Customer 360 data...</p>
            </div>
          ) : !data ? (
            <div className="p-8 text-center text-slate-500">No details found.</div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Sales</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">₹{(kpis.total_sales || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{kpis.total_invoices || 0} Invoices posted</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">Total Received</p>
                      <p className="mt-1 text-xl font-bold text-emerald-600">₹{(kpis.paid_amount || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{payments.length} Payments recorded</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Outstanding</p>
                      <p className="mt-1 text-xl font-bold text-amber-700">₹{(kpis.outstanding_receivables || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-amber-600 mt-0.5">Calculated net balance</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Overdue Amount</p>
                      <p className="mt-1 text-xl font-bold text-rose-600">₹{(kpis.overdue_amount || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-rose-500 mt-0.5">Past invoice due date</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Avg Transaction</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">₹{(kpis.average_order_value || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">Per sales invoice</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">Lifetime Value</p>
                      <p className="mt-1 text-xl font-bold text-indigo-700">₹{(kpis.lifetime_value || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[11px] text-indigo-500 mt-0.5">Total completed</p>
                    </div>
                  </div>

                  {/* Profile Details & Sales Trend */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FiUser className="text-indigo-600" /> Customer Information
                      </h3>
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Email:</span>
                          <span className="font-semibold text-slate-900">{customer?.email || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Phone:</span>
                          <span className="font-semibold text-slate-900">{customer?.contact_no || customer?.phone || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">GSTIN:</span>
                          <span className="font-mono font-semibold text-slate-900">{customer?.gst_number || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">PAN:</span>
                          <span className="font-mono font-semibold text-slate-900">{customer?.pan || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Credit Limit:</span>
                          <span className="font-semibold text-slate-900">₹{Number(customer?.credit_limit || 0).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Payment Due Terms:</span>
                          <span className="font-semibold text-slate-900">{customer?.due_days || 0} days</span>
                        </div>
                        <div className="flex justify-between border-b border-slate-100 pb-1.5">
                          <span className="text-slate-500">Last Visit / Interaction:</span>
                          <span className="font-semibold text-indigo-700">{kpis.last_visit_date ? new Date(kpis.last_visit_date).toLocaleDateString() : 'No visit logged'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last Payment:</span>
                          <span className="font-semibold text-emerald-600">
                            {kpis.last_payment_date ? `${new Date(kpis.last_payment_date).toLocaleDateString()} (₹${(kpis.last_payment_amount || 0).toLocaleString('en-IN')})` : 'None'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 lg:col-span-2">
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FiActivity className="text-indigo-600" /> Sales Trend (Last 6 Months)
                      </h3>
                      <div className="grid grid-cols-6 gap-2 pt-4 items-end h-36">
                        {(kpis.sales_trend || []).map((trend: any, idx: number) => {
                          const maxVal = Math.max(...(kpis.sales_trend || []).map((t: any) => t.total), 1);
                          const heightPct = Math.max(8, Math.round((trend.total / maxVal) * 100));
                          return (
                            <div key={idx} className="flex flex-col items-center gap-2 h-full justify-end">
                              <div
                                style={{ height: `${trend.total > 0 ? heightPct : 4}%` }}
                                className={`w-full max-w-[42px] rounded-t-md transition-all ${
                                  trend.total > 0
                                    ? 'bg-gradient-to-t from-indigo-600 to-indigo-400 hover:opacity-90 shadow-sm'
                                    : 'bg-slate-200 border-t border-slate-300'
                                }`}
                                title={`${trend.month}: ₹${Number(trend.total).toLocaleString('en-IN')}`}
                              />
                              <span className="text-[10px] font-semibold text-slate-600 truncate w-full text-center">
                                {trend.month}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-medium truncate w-full text-center">
                                {trend.total > 0 ? `₹${trend.total >= 1000 ? `${(trend.total / 1000).toFixed(1)}k` : Number(trend.total).toLocaleString('en-IN')}` : '₹0'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: QUOTATIONS */}
              {activeTab === 'quotations' && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Quotation #</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Valid Till</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Total Amount</th>
                        <th className="px-4 py-3 text-center">Invoice Conversion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotations.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">No quotations found for this customer.</td>
                        </tr>
                      ) : (
                        quotations.map((q: any) => (
                          <tr key={q.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(`/quotations/${q.id}`);
                                }}
                                className="group inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                title="Open quotation details"
                              >
                                {q.quotation_number || `#${q.id}`}
                                <FiExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                              </button>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{q.quotation_date || 'N/A'}</td>
                            <td className="px-4 py-3 text-slate-500">{q.valid_until || q.valid_till || 'N/A'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="text-[11px] capitalize">
                                {q.status || 'draft'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-900">
                              ₹{Number(q.total_amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {q.converted_invoice_id ? (
                                <Badge className="bg-emerald-500 text-[10px]">
                                  Converted (INV #{q.converted_invoice_id})
                                </Badge>
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: SALES & INVOICES */}
              {activeTab === 'sales' && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Invoice #</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3">Payment Status</th>
                        <th className="px-4 py-3 text-right">Total Amount</th>
                        <th className="px-4 py-3 text-right">Paid Amount</th>
                        <th className="px-4 py-3 text-right">Balance Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400">No invoices recorded for this customer.</td>
                        </tr>
                      ) : (
                        invoices.map((inv: any) => {
                          const total = Number(inv.grand_total || inv.total_amount || 0);
                          const paid = Number(inv.paid_amount || 0);
                          const balance = Math.max(0, total - paid);
                          const paymentStatus = (inv.payment_status && inv.payment_status !== 'pending')
                            ? inv.payment_status
                            : (balance <= 0.01 && total > 0 ? 'paid' : (paid > 0 ? 'partial' : (inv.status === 'paid' ? 'paid' : 'unpaid')));
                          return (
                            <tr key={inv.id} className="hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    navigate(`/invoices/${inv.id}`);
                                  }}
                                  className="group inline-flex items-center gap-1.5 font-semibold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                  title="Open invoice details"
                                >
                                  {inv.invoice_no || `#${inv.id}`}
                                  <FiExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                </button>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{inv.invoice_date || 'N/A'}</td>
                              <td className="px-4 py-3 text-slate-500">{inv.due_date || 'N/A'}</td>
                              <td className="px-4 py-3">
                                <Badge
                                  variant="outline"
                                  className={
                                    paymentStatus === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : paymentStatus === 'partial'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }
                                >
                                  {paymentStatus}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900">₹{total.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-3 text-right text-emerald-600 font-semibold">₹{paid.toLocaleString('en-IN')}</td>
                              <td className="px-4 py-3 text-right text-amber-700 font-bold">₹{balance.toLocaleString('en-IN')}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 4: PAYMENTS */}
              {activeTab === 'payments' && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Receipt / Ref #</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Direction</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">No payment records found.</td>
                        </tr>
                      ) : (
                        payments.map((p: any) => (
                          <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-800">{p.reference_no || `#${p.id}`}</td>
                            <td className="px-4 py-3 text-slate-600">{p.payment_date || p.transaction_date || 'N/A'}</td>
                            <td className="px-4 py-3 uppercase text-slate-600 font-mono text-[11px]">{p.payment_method || 'Cash'}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={p.payment_direction === 'outward' ? 'text-rose-600' : 'text-emerald-600'}>
                                {p.payment_direction || 'inward'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-600">
                              ₹{Number(p.amount || 0).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 5: OUTSTANDING & AGING */}
              {activeTab === 'outstanding' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                      <p className="text-xs font-semibold text-emerald-800 uppercase">0 - 30 Days (Current)</p>
                      <p className="mt-2 text-2xl font-bold text-emerald-700">₹{(aging.current || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                      <p className="text-xs font-semibold text-amber-800 uppercase">31 - 60 Days</p>
                      <p className="mt-2 text-2xl font-bold text-amber-700">₹{(aging.days_30 || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
                      <p className="text-xs font-semibold text-orange-800 uppercase">61 - 90 Days</p>
                      <p className="mt-2 text-2xl font-bold text-orange-700">₹{(aging.days_60 || 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                      <p className="text-xs font-semibold text-rose-800 uppercase">90+ Days (Critical)</p>
                      <p className="mt-2 text-2xl font-bold text-rose-700">₹{(aging.days_90_plus || 0).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 mb-2">Aging Policy Notice</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Receivables beyond 60 days require immediate escalation. Accounts reaching 90+ days are automatically flagged in credit limit controls for future quotation approvals.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 6: PRODUCTS PURCHASED */}
              {activeTab === 'products' && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Product Name</th>
                        <th className="px-4 py-3">HSN / SAC</th>
                        <th className="px-4 py-3 text-right">Total Quantity</th>
                        <th className="px-4 py-3 text-right">Total Spend</th>
                        <th className="px-4 py-3 text-right">Last Purchased</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">No purchased product history available.</td>
                        </tr>
                      ) : (
                        products.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              <div className="text-slate-900 font-semibold">{p.product_name || `Product #${p.product_id}`}</div>
                              {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-500">{p.hsn_sac_code || '—'}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-800">
                              {p.total_quantity} {p.uom || 'units'}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-indigo-600">
                              ₹{Number(p.total_spend || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500">
                              {p.last_purchased_at ? new Date(p.last_purchased_at).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 7: ADDRESSES */}
              {activeTab === 'addresses' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FiMapPin className="text-indigo-600" /> Billing Address
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {customer?.billing_street || 'No street specified'}<br />
                      {customer?.billing_landmark && `Landmark: ${customer.billing_landmark}`}<br />
                      {customer?.billing_city && `${customer.billing_city}, `}
                      {customer?.billing_state && `${customer.billing_state} - `}
                      {customer?.billing_pincode}<br />
                      {customer?.billing_country || 'India'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <FiMapPin className="text-emerald-600" /> Shipping / Delivery Address
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {customer?.shipping_street || 'No shipping address specified'}<br />
                      {customer?.shipping_landmark && `Landmark: ${customer.shipping_landmark}`}<br />
                      {customer?.shipping_city && `${customer.shipping_city}, `}
                      {customer?.shipping_state && `${customer.shipping_state} - `}
                      {customer?.shipping_pincode}<br />
                      {customer?.shipping_country || 'India'}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 8: CONTACT PERSONS */}
              {activeTab === 'contacts' && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Name</th>
                        <th className="px-4 py-3">Designation</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Phone</th>
                        <th className="px-4 py-3">City</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contacts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">No contact persons registered.</td>
                        </tr>
                      ) : (
                        contacts.map((c: any) => (
                          <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                            <td className="px-4 py-3 text-slate-500">{c.designation || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{c.email || '—'}</td>
                            <td className="px-4 py-3 text-slate-800 font-mono">{c.phone || c.alt_phone || '—'}</td>
                            <td className="px-4 py-3 text-slate-500">{c.city || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 9: ACTIVITIES */}
              {activeTab === 'activities' && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <h4 className="text-sm font-bold text-slate-800">Timeline of Customer Interactions</h4>
                  {activities.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">No recent logged interactions.</p>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((a: any) => (
                        <div key={a.id} className="flex items-start gap-3 border-l-2 border-indigo-400 pl-3">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-900">{a.title || a.activity_type}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{a.description || a.notes}</p>
                            <span className="text-[10px] text-slate-400">{a.activity_at ? new Date(a.activity_at).toLocaleString() : ''}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 10: COMMUNICATION */}
              {activeTab === 'communication' && (
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center">
                  <FiMessageSquare className="h-10 w-10 text-indigo-500 mx-auto mb-2 opacity-80" />
                  <h4 className="text-sm font-bold text-slate-900">Communication History</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Logged WhatsApp messages, SMS notifications, and system emails dispatched to {customer?.email || customer?.contact_no || 'this customer'}.
                  </p>
                </div>
              )}

              {/* TAB 11: AUDIT HISTORY */}
              {activeTab === 'audit' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-indigo-600 p-2 text-white">
                        <FiClock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">Last Customer Visit / Interaction Date</p>
                        <p className="text-base font-bold text-indigo-950 mt-0.5">
                          {kpis.last_visit_date ? new Date(kpis.last_visit_date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No logged visits or interactions recorded'}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-indigo-300 bg-white text-indigo-700 font-medium">
                      Audited Activity Log
                    </Badge>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600 uppercase">
                      <tr>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Actor</th>
                        <th className="px-4 py-3">Message</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">No audit events recorded for this customer.</td>
                        </tr>
                      ) : (
                        auditLogs.map((log: any) => (
                          <tr key={log.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                              {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{log.action}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={log.status === 'success' ? 'text-emerald-600' : 'text-slate-600'}>
                                {log.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{log.user_name || 'System'}</td>
                            <td className="px-4 py-3 text-slate-600">{log.message}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500">
          <span>RaptorERP Customer 360 Workspace • Live Ledger & Transaction Sync</span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
