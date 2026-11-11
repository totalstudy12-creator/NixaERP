import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiArrowDownLeft, FiDollarSign } from 'react-icons/fi';
import { CashDrawer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  drawer: CashDrawer | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CASH_IN_CATEGORIES = [
  { value: 'customer_payment', label: 'Customer Payment' },
  { value: 'cash_sales', label: 'Cash Sales' },
  { value: 'opening_float', label: 'Opening Float Deposit' },
  { value: 'owner_contribution', label: 'Owner Cash Contribution' },
  { value: 'transfer_in', label: 'Cash Received from Another Drawer' },
  { value: 'bank_withdrawal', label: 'Cash Withdrawal from Bank' },
  { value: 'other_receipt', label: 'Other Cash Receipts' },
];

export const CashInModal: React.FC<Props> = ({
  isOpen,
  drawer,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('customer_payment');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setCategory('customer_payment');
      setReceivedFrom('');
      setReferenceNo('');
      setDescription('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !drawer) return null;

  const numAmount = parseFloat(amount) || 0;
  const currentBal = Number(drawer?.current_balance || 0);
  const resultingBal = Math.round((currentBal + numAmount) * 100) / 100;

  const handleSubmit = async () => {
    if (!drawer) return;
    if (numAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.recordCashIn(drawer.id, {
        amount: numAmount,
        category,
        received_from: receivedFrom.trim() || undefined,
        reference_no: referenceNo.trim() || undefined,
        description: description.trim() || undefined,
      });

      setAmount('');
      setReceivedFrom('');
      setReferenceNo('');
      setDescription('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record cash in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title={`Cash In — ${drawer.name}`}
      subtitle={`Deposit cash into ${drawer.code} (${drawer.branch?.name || 'Branch'})`}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={loading ? 'Processing...' : 'Deposit Cash'}
      loading={loading}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-200">
        {error && (
          <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Balance Preview */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-xs">
          <div>
            <span className="text-slate-400 block uppercase tracking-wider font-medium">Current Balance</span>
            <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
              ₹{currentBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div>
            <span className="text-emerald-600 dark:text-emerald-400 block uppercase tracking-wider font-bold">Resulting Balance</span>
            <span className="font-bold text-sm text-emerald-600 dark:text-emerald-400">
              ₹{resultingBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Amount (₹) *
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-sm">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm font-bold pl-7 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {CASH_IN_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Received From (Payer / Customer)
            </label>
            <input
              type="text"
              value={receivedFrom}
              onChange={(e) => setReceivedFrom(e.target.value)}
              placeholder="e.g. Acme Corp, walk-in buyer..."
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Reference / Receipt No
            </label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. REC-84920"
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Description / Memo
          </label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional context about this cash deposit..."
            className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </Modal>
  );
};
