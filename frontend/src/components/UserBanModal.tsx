import React, { useState } from 'react';
import { FiAlertTriangle, FiX, FiSlash, FiClock, FiCheck } from 'react-icons/fi';
import { apiClient } from '../api';
import { useNotification } from './NotificationContext';

interface UserBanModalProps {
  user: {
    id: number;
    name: string;
    email: string;
    status?: string;
  } | null;
  mode: 'ban' | 'unban';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function UserBanModal({
  user,
  mode,
  isOpen,
  onClose,
  onSuccess,
}: UserBanModalProps) {
  const { showSuccess, showError } = useNotification();
  const [submitting, setSubmitting] = useState(false);
  const [action, setAction] = useState<'ban' | 'suspend'>('ban');
  const [reason, setReason] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | ''>('');

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      showError('Validation Error', 'A reason is required for account security actions.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'ban') {
        await apiClient.banUser(user.id, {
          action,
          reason: reason.trim(),
          duration_minutes: durationMinutes ? Number(durationMinutes) : undefined,
        });
        showSuccess(
          'Account Restricted',
          `User ${user.name} has been ${action === 'ban' ? 'banned' : 'suspended'}. All active tokens were revoked.`
        );
      } else {
        await apiClient.unbanUser(user.id, reason.trim());
        showSuccess('Account Restored', `User ${user.name} has been unbanned and can now log in.`);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      showError(
        'Action Failed',
        err?.response?.data?.message || err.message || 'Could not update user restriction status.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 place-items-center rounded-xl ${
                mode === 'ban' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {mode === 'ban' ? <FiSlash size={20} /> : <FiCheck size={20} />}
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {mode === 'ban' ? 'Restrict / Ban User' : 'Restore & Unban User'}
              </h3>
              <p className="text-xs text-slate-500">
                {user.name} ({user.email})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === 'ban' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Action Type
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-3">
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-xl border p-3 text-xs font-semibold transition ${
                    action === 'ban'
                      ? 'border-rose-500 bg-rose-50/50 text-rose-800 ring-2 ring-rose-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value="ban"
                    checked={action === 'ban'}
                    onChange={() => setAction('ban')}
                    className="sr-only"
                  />
                  <span>Permanent / Indefinite Ban</span>
                </label>
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-xl border p-3 text-xs font-semibold transition ${
                    action === 'suspend'
                      ? 'border-amber-500 bg-amber-50/50 text-amber-800 ring-2 ring-amber-500/20'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="action"
                    value="suspend"
                    checked={action === 'suspend'}
                    onChange={() => setAction('suspend')}
                    className="sr-only"
                  />
                  <span>Time-limited Suspension</span>
                </label>
              </div>
            </div>
          )}

          {mode === 'ban' && action === 'suspend' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Suspension Duration (Minutes)
              </label>
              <div className="mt-1 relative">
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 1440 for 24 hours"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Leave empty for indefinite suspension. Examples: 60 = 1 hour, 1440 = 1 day, 10080 = 7 days.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Audit Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder={
                mode === 'ban'
                  ? 'Explain why this user account is being banned or suspended…'
                  : 'Explain the justification for restoring this user account…'
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {mode === 'ban' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={14} />
                <span>
                  Immediate effect: All current active browser sessions, API bearer tokens, and mobile sessions will be revoked instantly.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-sm transition ${
                mode === 'ban'
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
              }`}
            >
              {submitting
                ? 'Processing…'
                : mode === 'ban'
                ? action === 'ban'
                  ? 'Confirm Ban'
                  : 'Confirm Suspension'
                : 'Confirm Restore'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
