import React, { useState } from 'react';
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheckCircle,
  FiClock,
  FiPlus,
  FiRepeat,
  FiXCircle,
} from 'react-icons/fi';
import { CashDrawerTransfer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  transfers: CashDrawerTransfer[];
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  onInitiateTransfer: () => void;
  onRefresh: () => void;
}

export const CashTransfersTab: React.FC<Props> = ({
  transfers,
  loading,
  onInitiateTransfer,
  onRefresh,
}) => {
  const [selectedTransfer, setSelectedTransfer] = useState<CashDrawerTransfer | null>(null);
  const [modalAction, setModalAction] = useState<'receive' | 'reject' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleOpenAction = (t: CashDrawerTransfer, action: 'receive' | 'reject') => {
    setSelectedTransfer(t);
    setModalAction(action);
    setActionNotes('');
    setActionError(null);
  };

  const handleExecuteAction = async () => {
    if (!selectedTransfer || !modalAction) return;

    if (modalAction === 'reject' && !actionNotes.trim()) {
      setActionError('A mandatory rejection reason is required to refund the source drawer.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (modalAction === 'receive') {
        await cashDrawerService.receiveTransfer(selectedTransfer.id, {
          notes: actionNotes.trim() || undefined,
        });
      } else {
        await cashDrawerService.rejectTransfer(selectedTransfer.id, {
          reason: actionNotes.trim(),
        });
      }

      setModalAction(null);
      setSelectedTransfer(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to process transfer action');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FiRepeat className="text-indigo-600" />
            Cash Transit &amp; Transfer Registry
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Secure multi-step workflow for inter-drawer, safe drops, and cross-branch cash transit
          </p>
        </div>

        <button
          type="button"
          onClick={onInitiateTransfer}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors self-start sm:self-auto"
        >
          <FiPlus size={15} />
          <span>New Cash Transfer</span>
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4 font-semibold">Transfer No &amp; Date</th>
              <th className="py-3 px-4 font-semibold">Source (From)</th>
              <th className="py-3 px-4 font-semibold">Destination (To)</th>
              <th className="py-3 px-4 font-semibold text-right">Amount</th>
              <th className="py-3 px-4 font-semibold text-center">Status</th>
              <th className="py-3 px-4 font-semibold">Initiated By</th>
              <th className="py-3 px-4 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-xs">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mr-2"></div>
                  Loading transfer ledger...
                </td>
              </tr>
            ) : transfers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                  No cash transfers recorded yet. Click &ldquo;New Cash Transfer&rdquo; to move cash between registers or vaults.
                </td>
              </tr>
            ) : (
              transfers.map((t) => {
                const isPending = ['initiated', 'in_transit'].includes(t.status);
                const isDone = ['received', 'completed'].includes(t.status);
                const transferDate = t.initiated_at || t.created_at || '';
                return (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors">
                    <td className="py-3 px-4 font-mono">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">{t.transfer_number}</span>
                      <span className="text-[10px] text-slate-400">
                        {transferDate
                          ? new Date(transferDate).toLocaleString('en-IN', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {t.source_drawer?.name || 'Drawer'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {t.source_branch?.name || 'Branch'}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                        {t.destination_drawer?.name || 'Drawer'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {t.destination_branch?.name || 'Branch'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                      ₹{Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          : t.status === 'rejected' || t.status === 'cancelled'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      }`}>
                        {isDone && <FiCheckCircle size={11} />}
                        {isPending && <FiClock size={11} className="animate-spin" />}
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-500">
                      {t.initiator?.name || t.sender?.name || 'User'}
                    </td>

                    <td className="py-3 px-4 text-center">
                      {isPending ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenAction(t, 'receive')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                          >
                            Receive
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenAction(t, 'reject')}
                            className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-800 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation & Rejection Action Modal */}
      {modalAction && selectedTransfer && (
        <Modal
          isOpen={Boolean(modalAction && selectedTransfer)}
          title={
            modalAction === 'receive'
              ? `Confirm Receipt of Cash — ${selectedTransfer.transfer_number}`
              : `Reject Transfer & Refund Source — ${selectedTransfer.transfer_number}`
          }
          subtitle={`Verify physical currency packet from ${selectedTransfer.source_drawer?.name}`}
          onClose={() => setModalAction(null)}
          onSubmit={handleExecuteAction}
          submitText={
            modalAction === 'receive'
              ? (actionLoading ? 'Receiving...' : 'Confirm Cash Received')
              : (actionLoading ? 'Processing Refund...' : 'Reject & Refund Cash')
          }
          loading={actionLoading}
        >
          <div className="space-y-4 text-slate-700 dark:text-slate-200 text-xs">
            {actionError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
                <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
                <span>{actionError}</span>
              </div>
            )}

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Transfer Amount:</span>
                <strong className="text-base text-slate-900 dark:text-slate-100 font-bold">
                  ₹{Number(selectedTransfer.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">From:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTransfer.source_drawer?.name} ({selectedTransfer.source_branch?.name})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">To:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{selectedTransfer.destination_drawer?.name} ({selectedTransfer.destination_branch?.name})</span>
              </div>
            </div>

            {modalAction === 'receive' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirmation Notes (Optional)
                </label>
                <input
                  type="text"
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g. Physical currency counted and placed in register"
                  className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
                  Mandatory Rejection Reason *
                </label>
                <textarea
                  required
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="State reason for rejecting cash transit (e.g. count mismatch, packet damaged)..."
                  className="w-full text-xs p-2.5 border border-rose-300 dark:border-rose-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Rejecting will cancel this transfer and create an automatic compensating refund transaction back into the source drawer.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
