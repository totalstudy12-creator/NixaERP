import React, { useState, useEffect } from 'react';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiPrinter,
  FiUserCheck,
} from 'react-icons/fi';
import { CashDrawerSession, CashDrawer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  drawers: CashDrawer[];
  onRefresh: () => void;
}

export const CashDrawerReportsTab: React.FC<Props> = ({ drawers, onRefresh }) => {
  const [selectedDrawerId, setSelectedDrawerId] = useState<number | 'all'>('all');
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewModalSession, setReviewModalSession] = useState<CashDrawerSession | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      if (selectedDrawerId !== 'all') {
        const res = await cashDrawerService.listSessions(selectedDrawerId);
        setSessions(res.data || []);
      } else if (drawers.length > 0) {
        const promises = drawers.map(d => cashDrawerService.listSessions(d.id).catch(() => ({ data: [] })));
        const results = await Promise.all(promises);
        const all = results.flatMap(r => r.data || []);
        all.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
        setSessions(all);
      }
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [selectedDrawerId, drawers]);

  const handleReviewDiscrepancy = async () => {
    if (!reviewModalSession) return;
    setReviewLoading(true);
    setReviewError(null);

    try {
      await cashDrawerService.reviewDiscrepancy(reviewModalSession.id, {
        action: reviewAction,
        notes: reviewNotes.trim() || undefined,
      });

      setReviewModalSession(null);
      fetchSessions();
      onRefresh();
    } catch (err: any) {
      setReviewError(err?.response?.data?.message || err?.message || 'Failed to review discrepancy');
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Daily Reconciliation Summary Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FiFileText className="text-indigo-600" />
              Daily Shift Reconciliations &amp; Session Logs
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Audit opening floats, shift cash flows, actual closing counts, and supervisor approval logs
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedDrawerId}
              onChange={(e) => setSelectedDrawerId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs py-1.5 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">All Drawers</option>
              {drawers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
            >
              <FiPrinter size={13} />
              <span>Print Book</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Session &amp; Date</th>
                <th className="py-2.5 px-3 font-semibold">Cashier</th>
                <th className="py-2.5 px-3 font-semibold text-right">Opening Float</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total In</th>
                <th className="py-2.5 px-3 font-semibold text-right">Total Out</th>
                <th className="py-2.5 px-3 font-semibold text-right">Expected Cash</th>
                <th className="py-2.5 px-3 font-semibold text-right">Actual Count</th>
                <th className="py-2.5 px-3 font-semibold text-center">Difference</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                <th className="py-2.5 px-3 font-semibold text-center">Approval Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mr-2"></div>
                    Loading sessions...
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 text-xs">
                    No session closing records found.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const diff = Number(s.closing_difference || 0);
                  const hasDiff = Math.abs(diff) > 0.009;
                  const isClosed = s.status === 'closed';

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">#{s.session_number}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(s.opened_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-700 dark:text-slate-200 block">{s.cashier?.name || 'Cashier'}</span>
                        <span className="text-[10px] text-slate-400">{s.cash_drawer?.name || 'Drawer'}</span>
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        ₹{Number(s.opening_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        ₹{Number(s.total_cash_in || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono text-rose-600 dark:text-rose-400">
                        ₹{Number(s.total_cash_out || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        ₹{Number(s.expected_closing_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {isClosed ? `₹${Number(s.actual_closing_cash || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {isClosed ? (
                          !hasDiff ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <FiCheckCircle size={12} /> ₹0.00
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-0.5 font-bold text-[11px] px-1.5 py-0.5 rounded-full ${
                              diff < 0
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}>
                              {diff < 0 ? `-₹${Math.abs(diff).toLocaleString('en-IN')}` : `+₹${diff.toLocaleString('en-IN')}`}
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">Open</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          s.status === 'closed'
                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}>
                          {s.status}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        {isClosed && hasDiff ? (
                          s.approved_by ? (
                            <div className="text-[11px] text-emerald-600 flex items-center justify-center gap-1 font-semibold">
                              <FiCheckCircle size={11} />
                              <span>Approved ({s.approver?.name || 'Supervisor'})</span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setReviewModalSession(s);
                                setReviewAction('approve');
                                setReviewNotes('');
                                setReviewError(null);
                              }}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 text-[11px] font-bold rounded-lg border border-amber-300 dark:border-amber-800 transition-colors"
                            >
                              Review Variance
                            </button>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Discrepancy Approval Modal */}
      {reviewModalSession && (
        <Modal
          isOpen={Boolean(reviewModalSession)}
          title={`Supervisor Review: Discrepancy on Session #${reviewModalSession.session_number}`}
          subtitle={`Audit cash difference recorded for ${reviewModalSession.cash_drawer?.name || 'Cash Register'}`}
          onClose={() => setReviewModalSession(null)}
          onSubmit={handleReviewDiscrepancy}
          submitText={reviewLoading ? 'Submitting...' : 'Confirm Discrepancy Decision'}
          loading={reviewLoading}
        >
          <div className="space-y-4 text-xs text-slate-700 dark:text-slate-200">
            {reviewError && (
              <div className="p-3 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2">
                <FiAlertTriangle className="shrink-0 text-rose-600" size={16} />
                <span>{reviewError}</span>
              </div>
            )}

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span>Expected: <strong>₹{Number(reviewModalSession.expected_closing_cash).toFixed(2)}</strong></span>
                <span>Counted: <strong>₹{Number(reviewModalSession.actual_closing_cash).toFixed(2)}</strong></span>
                <span className="font-bold text-rose-600">
                  Variance: {Number(reviewModalSession.closing_difference) < 0 ? 'Shortage' : 'Excess'} of ₹{Math.abs(Number(reviewModalSession.closing_difference)).toFixed(2)}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Cashier Explanation: <em className="text-slate-800 dark:text-slate-100">&ldquo;{reviewModalSession.discrepancy_reason || 'None provided'}&rdquo;</em>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Action Decision
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReviewAction('approve')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    reviewAction === 'approve'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Approve Variance
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction('reject')}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                    reviewAction === 'reject'
                      ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                      : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Reject &amp; Flag Discrepancy
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Supervisor Audit Note
              </label>
              <textarea
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Audit observation regarding the variance..."
                className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
