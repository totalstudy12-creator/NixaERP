import React, { useState, useEffect } from 'react';
import { FiClipboard, FiClock, FiShield, FiUser } from 'react-icons/fi';
import { CashDrawerAuditLog } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';

interface Props {
  drawerId?: number;
}

export const CashDrawerAuditTab: React.FC<Props> = ({ drawerId }) => {
  const [logs, setLogs] = useState<CashDrawerAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await cashDrawerService.getAuditLogs({
        cash_drawer_id: drawerId,
        action: actionFilter !== 'all' ? actionFilter : undefined,
      });
      setLogs(res.data || []);
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [drawerId, actionFilter]);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xs overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FiShield className="text-indigo-600" />
            Cash Drawer Security &amp; Audit Trail
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Immutable log of sessions opened, closed, cash transactions, transfers, and discrepancy approvals
          </p>
        </div>

        <div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs py-1.5 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">All Audit Actions</option>
            <option value="session_opened">Session Opened</option>
            <option value="session_closed">Session Closed</option>
            <option value="cash_in">Cash In</option>
            <option value="cash_out">Cash Out</option>
            <option value="transfer_initiated">Transfer Initiated</option>
            <option value="transfer_received">Transfer Received</option>
            <option value="transfer_rejected">Transfer Rejected</option>
            <option value="discrepancy_approved">Discrepancy Approved</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
            <tr>
              <th className="py-2.5 px-4 font-semibold">Timestamp</th>
              <th className="py-2.5 px-4 font-semibold">Action</th>
              <th className="py-2.5 px-4 font-semibold">Drawer</th>
              <th className="py-2.5 px-4 font-semibold">User</th>
              <th className="py-2.5 px-4 font-semibold">IP Address</th>
              <th className="py-2.5 px-4 font-semibold">Details &amp; Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-600 border-t-transparent mr-2"></div>
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                  No audit log entries found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 transition-colors">
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                    {new Date(log.created_at).toLocaleString('en-IN', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>

                  <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                    <span className="capitalize">{log.action.replace('_', ' ')}</span>
                  </td>

                  <td className="py-2.5 px-4 font-medium">
                    {log.cash_drawer?.name || (log.cash_drawer_id ? `Drawer #${log.cash_drawer_id}` : '—')}
                  </td>

                  <td className="py-2.5 px-4 flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <FiUser size={12} className="text-slate-400" />
                    <span>{log.user?.name || `User #${log.user_id || 'System'}`}</span>
                  </td>

                  <td className="py-2.5 px-4 font-mono text-slate-400 text-[11px]">
                    {log.ip_address || '—'}
                  </td>

                  <td className="py-2.5 px-4">
                    <span className="text-slate-700 dark:text-slate-300">{log.notes || '—'}</span>
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
