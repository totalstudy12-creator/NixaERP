import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiArrowUpRight, FiCheck } from 'react-icons/fi';
import { CashDrawer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  drawer: CashDrawer | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CASH_OUT_CATEGORIES = [
  { value: 'shop_expenses', label: 'Shop / Store Expenses' },
  { value: 'staff_expenses', label: 'Staff Expenses & Refreshments' },
  { value: 'staff_advance', label: 'Staff Salary Advance' },
  { value: 'supplier_payment', label: 'Supplier Cash Payment' },
  { value: 'purchase_payment', label: 'Purchase Invoice Payment' },
  { value: 'bank_deposit', label: 'Bank Cash Deposit' },
  { value: 'transfer_out', label: 'Cash Transfer to Another Drawer' },
  { value: 'safe_deposit', label: 'Cash Transfer to Branch Safe / Vault' },
  { value: 'other_expense', label: 'Other Cash Expenses' },
];

export const CashOutModal: React.FC<Props> = ({
  isOpen,
  drawer,
  onClose,
  onSuccess,
}) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('shop_expenses');
  const [paidTo, setPaidTo] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [description, setDescription] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setCategory('shop_expenses');
      setPaidTo('');
      setReferenceNo('');
      setDescription('');
      setConfirmStep(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !drawer) return null;

  const numAmount = parseFloat(amount) || 0;
  const currentBal = Number(drawer?.current_balance || 0);
  const allowOverdraft = Boolean(drawer?.allow_overdraft);
  const overdraftLimit = Number(drawer?.overdraft_limit || 0);

  const resultingBal = Math.round((currentBal - numAmount) * 100) / 100;
  const isInsufficient = numAmount > currentBal && (!allowOverdraft || numAmount > (currentBal + overdraftLimit));

  const handleNextOrSubmit = async () => {
    if (!drawer) return;

    if (numAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    if (isInsufficient) {
      setError(`Disbursement exceeds available cash (₹${currentBal.toLocaleString('en-IN')})${allowOverdraft ? ` and overdraft limit (₹${overdraftLimit.toLocaleString('en-IN')})` : ''}.`);
      return;
    }

    if (!confirmStep) {
      setError(null);
      setConfirmStep(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.recordCashOut(drawer.id, {
        amount: numAmount,
        category,
        paid_to: paidTo.trim() || undefined,
        reference_no: referenceNo.trim() || undefined,
        description: description.trim() || undefined,
      });

      setAmount('');
      setPaidTo('');
      setReferenceNo('');
      setDescription('');
      setConfirmStep(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record cash out');
      setConfirmStep(false);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfirmStep(false);
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      title={confirmStep ? `Confirm Payout — ₹${numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : `Cash Out — ${drawer.name}`}
      subtitle={confirmStep ? 'Review payout details before handing over cash' : `Disburse cash from ${drawer.code} (${drawer.branch?.name || 'Branch'})`}
      onClose={handleClose}
      onSubmit={handleNextOrSubmit}
      submitText={confirmStep ? (loading ? 'Authorizing Payout...' : 'Confirm Cash Disbursement') : 'Review Payout'}
      loading={loading}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-200">
        {error && (
          <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Step View */}
        {confirmStep ? (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <FiAlertTriangle className="text-amber-600" size={16} />
              <span>Are you sure you want to disburse this cash?</span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Please verify that physical currency is counted and authorized before finalizing this payout entry.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200 dark:border-amber-800">
              <div><span className="text-slate-400">Drawer:</span> <strong className="text-slate-800 dark:text-slate-200 block">{drawer.name}</strong></div>
              <div><span className="text-slate-400">Payout Amount:</span> <strong className="text-rose-600 block">₹{numAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
              <div><span className="text-slate-400">Category:</span> <strong className="text-slate-800 dark:text-slate-200 block">{category}</strong></div>
              <div><span className="text-slate-400">Paid To:</span> <strong className="text-slate-800 dark:text-slate-200 block">{paidTo || 'N/A'}</strong></div>
              <div><span className="text-slate-400">Reference:</span> <strong className="text-slate-800 dark:text-slate-200 block">{referenceNo || 'N/A'}</strong></div>
              <div><span className="text-slate-400">Remaining Balance:</span> <strong className="text-emerald-600 block">₹{resultingBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
            </div>
          </div>
        ) : (
          <>
            {/* Balance Preview */}
            <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 block uppercase tracking-wider font-medium">Available Cash</span>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                  ₹{currentBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className={`block uppercase tracking-wider font-semibold ${isInsufficient ? 'text-rose-500' : 'text-slate-500 dark:text-slate-400'}`}>
                  Post-Disbursement Balance
                </span>
                <span className={`font-bold text-sm ${isInsufficient ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}>
                  ₹{resultingBal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Payout Amount (₹) *
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
                    className={`w-full text-sm font-bold pl-7 pr-3 py-2 border rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                      isInsufficient
                        ? 'border-rose-500 focus:ring-rose-500/20 text-rose-600'
                        : 'border-slate-300 dark:border-slate-700 focus:ring-indigo-500/20'
                    }`}
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
                  {CASH_OUT_CATEGORIES.map((cat) => (
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
                  Paid To (Payee / Vendor)
                </label>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder="e.g. Courier service, office supplier..."
                  className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Voucher / Receipt Ref
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. VCH-00129"
                  className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Disbursement Reason / Notes
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Business justification for physical cash expenditure..."
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
