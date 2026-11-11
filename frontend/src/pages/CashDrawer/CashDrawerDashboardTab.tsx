import React from 'react';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiBox,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiRepeat,
  FiShoppingBag,
  FiTrendingDown,
  FiTrendingUp,
  FiUsers,
  FiAlertTriangle,
} from 'react-icons/fi';
import { CashDrawerDashboardData, CashDrawer } from '../../types/cashDrawer';

interface Props {
  data: CashDrawerDashboardData | null;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  onOpenDrawer: (drawer: CashDrawer) => void;
  onCloseDrawer: (drawer: CashDrawer) => void;
  onCashIn: (drawer: CashDrawer) => void;
  onCashOut: (drawer: CashDrawer) => void;
}

export const CashDrawerDashboardTab: React.FC<Props> = ({
  data,
  loading,
  onOpenDrawer,
  onCloseDrawer,
  onCashIn,
  onCashOut,
}) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-600 border-t-transparent"></div>
        <span className="ml-3 text-xs font-semibold">Loading cash metrics...</span>
      </div>
    );
  }

  if (!data) return null;

  const kpis = [
    {
      title: 'Opening Cash Today',
      value: `₹${(data.opening_cash_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: FiClock,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400',
    },
    {
      title: 'Total Cash In',
      value: `₹${(data.total_cash_in || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: FiArrowDownLeft,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400',
      sub: `Sales: ₹${(data.cash_sales_received || 0).toLocaleString('en-IN')}`,
    },
    {
      title: 'Total Cash Out',
      value: `₹${(data.total_cash_out || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: FiArrowUpRight,
      color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400',
      sub: `Expenses: ₹${(data.cash_expenses || 0).toLocaleString('en-IN')}`,
    },
    {
      title: 'Current Cash on Hand',
      value: `₹${(data.total_current_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      icon: FiDollarSign,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400',
      sub: `${data.open_drawers} of ${data.active_drawers} drawers open`,
    },
  ];

  const breakdownKpis = [
    { title: 'Customer Cash Receipts', value: data.customer_cash_payments, icon: FiUsers, color: 'text-teal-600' },
    { title: 'Cash Sales (Till Invoices)', value: data.cash_sales_received, icon: FiShoppingBag, color: 'text-emerald-600' },
    { title: 'Cash Expenses Disbursed', value: data.cash_expenses, icon: FiTrendingDown, color: 'text-amber-600' },
    { title: 'Supplier Cash Payouts', value: data.supplier_cash_payments, icon: FiBox, color: 'text-orange-600' },
    { title: 'Transfers Dispatched', value: data.transfers_out, icon: FiRepeat, color: 'text-indigo-600' },
    { title: 'Expected Closing Cash', value: data.expected_closing_cash, icon: FiTrendingUp, color: 'text-purple-600' },
    { title: 'Actual Closing Physical', value: data.actual_closing_cash, icon: FiCheckCircle, color: 'text-cyan-600' },
    {
      title: 'Closing Variance (Net)',
      value: data.cash_difference,
      icon: FiAlertTriangle,
      color: data.cash_difference < 0 ? 'text-rose-600' : data.cash_difference > 0 ? 'text-blue-600' : 'text-slate-600',
      highlight: Math.abs(data.cash_difference) > 0.009,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div
            key={idx}
            className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs flex items-center justify-between"
          >
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{kpi.title}</p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{kpi.value}</h3>
              {kpi.sub && <p className="text-[11px] text-slate-400 mt-0.5">{kpi.sub}</p>}
            </div>
            <div className={`p-3 rounded-xl ${kpi.color}`}>
              <kpi.icon size={22} />
            </div>
          </div>
        ))}
      </div>

      {/* Granular ERP Flow Cards */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <FiDollarSign className="text-indigo-600" />
          Financial Flow &amp; Cash Movements
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {breakdownKpis.map((item, idx) => (
            <div
              key={idx}
              className={`p-3.5 rounded-xl border ${
                item.highlight
                  ? 'border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20'
                  : 'border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1 text-slate-500 text-xs">
                <item.icon className={item.color} size={14} />
                <span className="truncate">{item.title}</span>
              </div>
              <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 font-mono">
                ₹{(item.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Branch Balances Matrix (for Company-wide view) */}
      {data.branch_breakdown && data.branch_breakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-xs">
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <FiBox className="text-indigo-600" />
            Consolidated Branch Cash Balances
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-400 uppercase border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Branch Name</th>
                  <th className="py-2.5 px-4 font-semibold">Total Drawers</th>
                  <th className="py-2.5 px-4 font-semibold">Active Sessions</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Cash Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {data.branch_breakdown.map((b) => (
                  <tr key={b.branch_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-750">
                    <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">{b.branch_name}</td>
                    <td className="py-2.5 px-4">{b.total_drawers}</td>
                    <td className="py-2.5 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        b.open_drawers > 0
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {b.open_drawers} Open
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-slate-100 font-mono">
                      ₹{b.total_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick Drawer Action Cards */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-xs">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <FiClock className="text-indigo-600" />
          Active Drawers Status &amp; Quick Operations
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.drawers.map((d) => (
            <div
              key={d.id}
              className={`p-4 rounded-2xl border transition-all ${
                d.is_open
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h5 className="font-bold text-sm text-slate-900 dark:text-slate-100">{d.name}</h5>
                  <span className="text-xs text-slate-400 font-mono">
                    {d.code} • {d.branch?.name || d.branch_name || 'Branch'}
                  </span>
                </div>
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${
                  d.is_open
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {d.is_open ? '● OPEN' : '○ CLOSED'}
                </span>
              </div>

              <div className="py-2 border-y border-slate-100 dark:border-slate-700/60 my-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">Drawer Balance:</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                  ₹{Number(d.current_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {d.active_session && (
                <div className="text-[11px] text-slate-500 space-y-0.5 mb-3 bg-white/60 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between">
                    <span>Cashier:</span>
                    <strong className="text-slate-700 dark:text-slate-300">{d.active_session.cashier?.name || d.active_session.cashier_name || 'Cashier'}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Opening Float:</span>
                    <span>₹{Number(d.active_session.opening_balance).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cash In / Out:</span>
                    <span className="text-emerald-600 font-medium">+₹{Number(d.active_session.total_cash_in).toLocaleString('en-IN')}</span>
                    <span className="text-rose-600 font-medium">-₹{Number(d.active_session.total_cash_out).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 pt-1">
                {d.is_open ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onCashIn(d)}
                      className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors shadow-xs"
                    >
                      <FiArrowDownLeft size={13} />
                      Cash In
                    </button>
                    <button
                      type="button"
                      onClick={() => onCashOut(d)}
                      className="flex-1 py-1.5 px-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors shadow-xs"
                    >
                      <FiArrowUpRight size={13} />
                      Cash Out
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloseDrawer(d)}
                      className="py-1.5 px-2.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1 transition-colors shadow-xs"
                    >
                      Close
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenDrawer(d)}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                  >
                    <FiClock size={14} />
                    Open Session
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
