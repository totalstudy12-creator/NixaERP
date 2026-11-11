import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiClock, FiDollarSign } from 'react-icons/fi';
import { CashDrawer, CashDrawerSession, CashDrawerDenominationItem } from '../../types/cashDrawer';
import { DenominationCalculator, defaultDenominations } from './DenominationCalculator';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  drawer: CashDrawer | null;
  session: CashDrawerSession | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CloseDrawerModal: React.FC<Props> = ({
  isOpen,
  drawer,
  session,
  onClose,
  onSuccess,
}) => {
  const [denominations, setDenominations] = useState<CashDrawerDenominationItem[]>(defaultDenominations);
  const [closingNotes, setClosingNotes] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openingBalance = Number(session?.opening_balance || 0);
  const totalCashIn = Number(session?.total_cash_in || 0);
  const totalCashOut = Number(session?.total_cash_out || 0);
  const expectedClosing = Math.round((openingBalance + totalCashIn - totalCashOut) * 100) / 100;

  const actualClosing = denominations.reduce((sum, item) => sum + (item.amount || 0), 0);
  const difference = Math.round((actualClosing - expectedClosing) * 100) / 100;
  const hasDifference = Math.abs(difference) > 0.009;

  useEffect(() => {
    if (isOpen) {
      setDenominations(defaultDenominations.map(d => ({ ...d, quantity: 0, amount: 0 })));
      setClosingNotes('');
      setDiscrepancyReason('');
      setError(null);
    }
  }, [isOpen, session]);

  if (!isOpen || !drawer || !session) return null;

  const handleSubmit = async () => {
    if (!drawer) return;

    if (hasDifference && !discrepancyReason.trim()) {
      setError(`Reconciliation discrepancy of ${difference > 0 ? `+₹${difference.toLocaleString('en-IN')}` : `-₹${Math.abs(difference).toLocaleString('en-IN')}`} requires an explanation before closing.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.closeSession(drawer.id, {
        actual_closing_cash: actualClosing,
        discrepancy_reason: hasDifference ? discrepancyReason : undefined,
        closing_notes: closingNotes.trim() || undefined,
        closing_denominations: denominations.filter(d => d.quantity > 0),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to close drawer session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Close Register & Reconcile — ${drawer.name}`}
      subtitle={`Count physical currency and verify variance for Session #${session.session_number}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={loading ? 'Reconciling & Closing...' : 'Submit Closing Count'}
      loading={loading}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-200">
        {error && (
          <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Expected Cash Equation Breakdown */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-slate-700/60 pb-2">
            <span>Session: <strong className="text-slate-800 dark:text-slate-200">#{session.session_number}</strong></span>
            <span>Cashier: <strong className="text-slate-800 dark:text-slate-200">{session.cashier?.name || 'Cashier'}</strong></span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-medium">Opening Float</span>
              <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                ₹{openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <span className="text-[10px] text-emerald-500 uppercase tracking-wider block font-medium">+ Total In</span>
              <span className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">
                ₹{totalCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800">
              <span className="text-[10px] text-rose-500 uppercase tracking-wider block font-medium">- Total Out</span>
              <span className="font-semibold text-xs text-rose-600 dark:text-rose-400">
                ₹{totalCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800">
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block font-bold">= Expected Cash</span>
              <span className="font-bold text-xs text-indigo-700 dark:text-indigo-300">
                ₹{expectedClosing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* Real-Time Discrepancy Indicator Card */}
        <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
          !hasDifference
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
            : difference < 0
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300'
        }`}>
          <div>
            <div className="flex items-center gap-1.5 font-bold text-xs">
              {!hasDifference ? (
                <>
                  <FiCheckCircle className="text-emerald-600 dark:text-emerald-400" size={15} />
                  <span>Exact Balance Reconciled</span>
                </>
              ) : difference < 0 ? (
                <>
                  <FiAlertTriangle className="text-rose-600 dark:text-rose-400" size={15} />
                  <span>Cash Shortage Detected</span>
                </>
              ) : (
                <>
                  <FiAlertTriangle className="text-blue-600 dark:text-blue-400" size={15} />
                  <span>Cash Excess Detected</span>
                </>
              )}
            </div>
            <p className="opacity-80 mt-0.5">
              Physical Cash Count: ₹{actualClosing.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[10px] opacity-75 uppercase block font-medium">Variance</span>
            <span className="text-sm font-extrabold">
              {difference > 0 ? `+₹${difference.toLocaleString('en-IN')}` : difference < 0 ? `-₹${Math.abs(difference).toLocaleString('en-IN')}` : '₹0.00'}
            </span>
          </div>
        </div>

        {/* Mandatory Explanation if Shortage / Excess */}
        {hasDifference && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-rose-700 dark:text-rose-400">
              Mandatory Discrepancy Reason *
            </label>
            <textarea
              required
              rows={2}
              value={discrepancyReason}
              onChange={(e) => setDiscrepancyReason(e.target.value)}
              placeholder="Explain cause of shortage/excess (e.g. unrecorded expense, change discrepancy)..."
              className="w-full text-xs p-2.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>
        )}

        {/* Physical Cash Denomination Counter */}
        <DenominationCalculator
          denominations={denominations}
          onChange={setDenominations}
        />

        {/* Optional Notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Closing Remarks (Optional)
          </label>
          <input
            type="text"
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
            placeholder="e.g. Shift ended smoothly, keys handed over to supervisor"
            className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </Modal>
  );
};
