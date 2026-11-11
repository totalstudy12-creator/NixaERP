import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiDollarSign } from 'react-icons/fi';
import { CashDrawer, CashDrawerDenominationItem } from '../../types/cashDrawer';
import { DenominationCalculator, defaultDenominations } from './DenominationCalculator';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  drawer: CashDrawer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OpenDrawerModal: React.FC<Props> = ({ isOpen, drawer, onClose, onSuccess }) => {
  const [denominations, setDenominations] = useState<CashDrawerDenominationItem[]>(defaultDenominations);
  const [openingNotes, setOpeningNotes] = useState('');
  const [differenceReason, setDifferenceReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedBalance = drawer?.suggested_opening_cash ?? Number(drawer?.current_balance || 0);

  const totalCalculated = denominations.reduce((sum, item) => sum + (item.amount || 0), 0);
  const difference = Math.round((totalCalculated - suggestedBalance) * 100) / 100;
  const hasDifference = Math.abs(difference) > 0.009;

  useEffect(() => {
    if (isOpen) {
      setDenominations(defaultDenominations.map(d => ({ ...d, quantity: 0, amount: 0 })));
      setOpeningNotes('');
      setDifferenceReason('');
      setError(null);
    }
  }, [isOpen, drawer]);

  if (!isOpen || !drawer) return null;

  const handleSubmit = async () => {
    if (!drawer) return;

    if (hasDifference && !differenceReason.trim()) {
      setError(`Opening cash (₹${totalCalculated.toLocaleString('en-IN')}) differs from carried forward balance (₹${suggestedBalance.toLocaleString('en-IN')}). A mandatory adjustment reason is required.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.openSession(drawer.id, {
        opening_balance: totalCalculated,
        opening_difference_reason: hasDifference ? differenceReason : undefined,
        opening_notes: openingNotes.trim() || undefined,
        opening_denominations: denominations.filter(d => d.quantity > 0),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to open drawer session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Open Session — ${drawer.name} (${drawer.code})`}
      subtitle={`Verify physical opening currency float for ${drawer.branch?.name || 'assigned branch'}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={loading ? 'Opening Register...' : 'Confirm & Open Drawer'}
      loading={loading}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-200">
        {error && (
          <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Previous Balance Summary Card */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-xs">
          <div>
            <span className="text-slate-500 uppercase tracking-wider block font-medium">Branch</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{drawer.branch?.name || 'Main Branch'}</span>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider block font-medium">Carried Forward Cash</span>
            <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
              ₹{suggestedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-slate-500 uppercase tracking-wider block font-medium">Physical Count Total</span>
            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
              ₹{totalCalculated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Discrepancy Alert */}
        {hasDifference && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs font-semibold">
              <FiAlertTriangle size={15} />
              <span>Balance Discrepancy: {difference > 0 ? `+₹${difference.toLocaleString('en-IN')} (Excess)` : `-₹${Math.abs(difference).toLocaleString('en-IN')} (Shortage)`}</span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The physical count differs from the carried-forward closing cash. Please specify the reason for this adjustment for audit logging.
            </p>
            <textarea
              required
              rows={2}
              value={differenceReason}
              onChange={(e) => setDifferenceReason(e.target.value)}
              placeholder="Mandatory explanation for opening discrepancy..."
              className="w-full text-xs p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}

        {/* Denomination Counter */}
        <DenominationCalculator
          denominations={denominations}
          onChange={setDenominations}
        />

        {/* Optional notes */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Opening Shift Notes (Optional)
          </label>
          <input
            type="text"
            value={openingNotes}
            onChange={(e) => setOpeningNotes(e.target.value)}
            placeholder="e.g. Morning cash float verified by cashier & supervisor"
            className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </Modal>
  );
};
