import React, { useState, useEffect } from 'react';
import { FiAlertTriangle, FiArrowRight, FiDollarSign } from 'react-icons/fi';
import { CashDrawer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  drawers: CashDrawer[];
  defaultSourceDrawer?: CashDrawer | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const InitiateTransferModal: React.FC<Props> = ({
  isOpen,
  drawers,
  defaultSourceDrawer,
  onClose,
  onSuccess,
}) => {
  const [sourceId, setSourceId] = useState<number | ''>('');
  const [destinationId, setDestinationId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initialSource = defaultSourceDrawer?.id || (drawers[0]?.id ?? '');
      setSourceId(initialSource);
      const remaining = drawers.filter((d) => d.id !== initialSource);
      setDestinationId(remaining[0]?.id ?? '');
      setAmount('');
      setNotes('');
      setError(null);
    }
  }, [isOpen, defaultSourceDrawer, drawers]);

  if (!isOpen) return null;

  const sourceDrawer = drawers.find((d) => d.id === sourceId);
  const destDrawer = drawers.find((d) => d.id === destinationId);
  const numAmount = parseFloat(amount) || 0;
  const availableBal = Number(sourceDrawer?.current_balance || 0);

  const handleSubmit = async () => {
    if (!sourceId || !destinationId) {
      setError('Please select both source and destination drawers.');
      return;
    }
    if (sourceId === destinationId) {
      setError('Source and destination cash drawers must be different.');
      return;
    }
    if (numAmount <= 0) {
      setError('Transfer amount must be greater than zero.');
      return;
    }
    if (numAmount > availableBal && !sourceDrawer?.allow_overdraft) {
      setError(`Insufficient cash in source drawer '${sourceDrawer?.name}'. Available: ₹${availableBal.toLocaleString('en-IN')}.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.initiateTransfer({
        source_drawer_id: Number(sourceId),
        destination_drawer_id: Number(destinationId),
        amount: numAmount,
        notes: notes.trim() || undefined,
      });

      setAmount('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to initiate cash transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Initiate Cash Transfer"
      subtitle="Inter-Drawer, Safe deposit, or Cross-Branch transfer"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={loading ? 'Dispatching Transfer...' : 'Initiate & Dispatch Cash'}
      loading={loading}
    >
      <div className="space-y-4 text-slate-700 dark:text-slate-200">
        {error && (
          <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
            <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Source Drawer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Source Drawer (From) *
            </label>
            <select
              value={sourceId}
              onChange={(e) => {
                const newSource = Number(e.target.value);
                setSourceId(newSource);
                if (destinationId === newSource) {
                  const alt = drawers.find((d) => d.id !== newSource);
                  setDestinationId(alt?.id ?? '');
                }
              }}
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {drawers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.branch?.name || 'Branch'}) — ₹{Number(d.current_balance).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
            {sourceDrawer && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                Available cash: <strong className="text-slate-800 dark:text-slate-200">₹{availableBal.toLocaleString('en-IN')}</strong>
              </span>
            )}
          </div>

          {/* Destination Drawer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Destination Drawer / Vault (To) *
            </label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(Number(e.target.value))}
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="">Select destination...</option>
              {drawers
                .filter((d) => d.id !== sourceId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.branch?.name || 'Branch'})
                  </option>
                ))}
            </select>
            {destDrawer && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                Target branch: <strong className="text-slate-800 dark:text-slate-200">{destDrawer.branch?.name || 'Main'}</strong>
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Transfer Amount (₹) *
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
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Transfer Notes & Purpose
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. End of day vault drop, replenishing change..."
            className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p className="font-semibold text-slate-800 dark:text-slate-200">Transfer Policy Note:</p>
          <p>
            Funds will be debited from source drawer immediately and held in state <strong className="text-indigo-600 dark:text-indigo-400">in_transit</strong> until physically counted and received by the destination cashier or supervisor.
          </p>
        </div>
      </div>
    </Modal>
  );
};
