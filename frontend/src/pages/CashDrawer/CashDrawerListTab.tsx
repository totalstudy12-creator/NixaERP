import React from 'react';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiPlus,
  FiRepeat,
  FiShield,
  FiSlash,
} from 'react-icons/fi';
import { CashDrawer } from '../../types/cashDrawer';

interface Props {
  drawers: CashDrawer[];
  loading: boolean;
  onOpenDrawer: (drawer: CashDrawer) => void;
  onCloseDrawer: (drawer: CashDrawer) => void;
  onCashIn: (drawer: CashDrawer) => void;
  onCashOut: (drawer: CashDrawer) => void;
  onInitiateTransfer: (drawer: CashDrawer) => void;
  onCreateDrawer: () => void;
  onViewTransactions: (drawer: CashDrawer) => void;
}

export const CashDrawerListTab: React.FC<Props> = ({
  drawers,
  loading,
  onOpenDrawer,
  onCloseDrawer,
  onCashIn,
  onCashOut,
  onInitiateTransfer,
  onCreateDrawer,
  onViewTransactions,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
            Cash Drawers Directory
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure registers, monitor real-time till balances, and manage daily opening/closing sessions
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateDrawer}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <FiPlus size={15} />
          <span>New Cash Drawer</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Drawer &amp; Code</th>
              <th className="py-3 px-4 font-semibold">Branch</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              <th className="py-3 px-4 font-semibold">Session State</th>
              <th className="py-3 px-4 font-semibold">Overdraft Policy</th>
              <th className="py-3 px-4 font-semibold text-right">Current Balance</th>
              <th className="py-3 px-4 font-semibold text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mr-2"></div>
                  Loading drawers...
                </td>
              </tr>
            ) : drawers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                  No cash drawers configured for this company/branch. Click &ldquo;New Cash Drawer&rdquo; to create one.
                </td>
              </tr>
            ) : (
              drawers.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <span>{d.name}</span>
                      {d.is_default && (
                        <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 px-1.5 py-0.5 rounded-md">
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{d.code}</span>
                  </td>

                  <td className="py-3 px-4">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {d.branch?.name || 'Main Branch'}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                      d.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {d.status}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    {d.is_open ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          OPEN
                        </span>
                        {d.active_session?.cashier && (
                          <span className="text-[11px] text-slate-400 block">
                            by {d.active_session.cashier.name}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-medium">Closed</span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-xs">
                    {d.allow_overdraft ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                        <FiShield size={12} /> Limit ₹{Number(d.overdraft_limit).toLocaleString('en-IN')}
                      </span>
                    ) : (
                      <span className="text-slate-400 flex items-center gap-1">
                        <FiSlash size={12} /> Strict
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 font-mono">
                      ₹{Number(d.current_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      {d.is_open ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onCashIn(d)}
                            title="Record Cash In"
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs flex items-center gap-1 font-semibold transition-colors"
                          >
                            <FiArrowDownLeft size={13} />
                            <span>In</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCashOut(d)}
                            title="Record Cash Out"
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 rounded-lg text-xs flex items-center gap-1 font-semibold transition-colors"
                          >
                            <FiArrowUpRight size={13} />
                            <span>Out</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCloseDrawer(d)}
                            title="Reconcile and Close Drawer"
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors"
                          >
                            Close
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenDrawer(d)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors"
                        >
                          <FiClock size={12} />
                          <span>Open</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onInitiateTransfer(d)}
                        title="Transfer Cash"
                        className="p-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs transition-colors"
                      >
                        <FiRepeat size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => onViewTransactions(d)}
                        title="View Ledger"
                        className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 text-xs font-medium transition-colors"
                      >
                        Ledger
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
