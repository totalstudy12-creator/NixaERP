import React from 'react';
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiDownload,
  FiFileText,
  FiPrinter,
  FiSearch,
} from 'react-icons/fi';
import { CashDrawer, CashDrawerTransaction } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';

interface Props {
  transactions: CashDrawerTransaction[];
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  drawers: CashDrawer[];
  selectedDrawerId: number | 'all';
  onDrawerChange: (id: number | 'all') => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  typeFilter: string;
  onTypeFilterChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
}

export const CashDrawerLedgerTab: React.FC<Props> = ({
  transactions,
  loading,
  drawers,
  selectedDrawerId,
  onDrawerChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  searchTerm,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
}) => {
  const handleExportCsv = () => {
    const url = cashDrawerService.getExportCsvUrl({
      cash_drawer_id: selectedDrawerId !== 'all' ? selectedDrawerId : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
    window.open(url, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Header & Export Controls */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FiFileText className="text-indigo-600" />
            Cash Drawer Ledger &amp; Transaction History
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Audit-grade immutable cash records, receipts, payouts, and running balances
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
            title="Download CSV report with formula injection defense"
          >
            <FiDownload size={13} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
            title="Print Cash Register Summary"
          >
            <FiPrinter size={13} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Search Input */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-2.5 text-slate-400" size={14} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search txn, ref, payee..."
            className="w-full text-xs py-2 pl-9 pr-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Drawer Filter */}
        <div>
          <select
            value={selectedDrawerId}
            onChange={(e) => onDrawerChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Cash Drawers</option>
            {drawers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.code})
              </option>
            ))}
          </select>
        </div>

        {/* Transaction Type Filter */}
        <div>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Transaction Types</option>
            <option value="cash_in">Cash In</option>
            <option value="cash_out">Cash Out</option>
            <option value="opening_float">Opening Float</option>
            <option value="transfer_in">Transfer In</option>
            <option value="transfer_out">Transfer Out</option>
            <option value="adjustment">Discrepancy Adjustment</option>
            <option value="reversal">Reversal / Refund</option>
          </select>
        </div>

        {/* Date From */}
        <div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full text-xs py-1.5 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Date To */}
        <div>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-full text-xs py-1.5 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Transactions Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="py-2.5 px-3 font-semibold">Txn ID &amp; Date</th>
              <th className="py-2.5 px-3 font-semibold">Drawer / Branch</th>
              <th className="py-2.5 px-3 font-semibold">Type &amp; Category</th>
              <th className="py-2.5 px-3 font-semibold">Counterparty / Reference</th>
              <th className="py-2.5 px-3 font-semibold text-right">Balance Before</th>
              <th className="py-2.5 px-3 font-semibold text-right">Movement</th>
              <th className="py-2.5 px-3 font-semibold text-right">Balance After</th>
              <th className="py-2.5 px-3 font-semibold">Cashier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mr-2"></div>
                  Loading ledger transactions...
                </td>
              </tr>
            ) : transactions.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                  No cash transactions found matching selected filters.
                </td>
              </tr>
            ) : (
              transactions.map((t) => {
                const isInward = ['cash_in', 'transfer_in', 'opening_float'].includes(t.transaction_type);
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{t.transaction_number}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(t.transaction_date).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 block">
                        {t.cash_drawer?.name || 'Drawer'}
                      </span>
                      <span className="text-[10px] text-slate-400">{t.branch?.name || 'Main Branch'}</span>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                        isInward
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}>
                        {isInward ? <FiArrowDownLeft size={10} /> : <FiArrowUpRight size={10} />}
                        {t.transaction_type.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 capitalize">
                        {t.category.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-2.5 px-3">
                      <span className="font-medium text-slate-700 dark:text-slate-200 block truncate max-w-[180px]">
                        {t.received_from_or_paid_to || 'General'}
                      </span>
                      {t.reference_no && (
                        <span className="text-[10px] text-slate-400 font-mono block">Ref: {t.reference_no}</span>
                      )}
                      {t.description && (
                        <span className="text-[10px] text-slate-400 block truncate max-w-[200px]">
                          {t.description}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                      ₹{Number(t.balance_before || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <span className={isInward ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {isInward ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 dark:text-slate-100">
                      ₹{Number(t.balance_after || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {t.creator?.name || 'Cashier'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
