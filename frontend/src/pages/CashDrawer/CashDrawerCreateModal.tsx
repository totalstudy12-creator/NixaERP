import React, { useState, useEffect } from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import { CashDrawer } from '../../types/cashDrawer';
import cashDrawerService from '../../services/cashDrawerService';
import { Modal } from '../../components/Modal';

interface Props {
  isOpen: boolean;
  branches: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSuccess: () => void;
}

export const CashDrawerCreateModal: React.FC<Props> = ({
  isOpen,
  branches,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [branchId, setBranchId] = useState<number | ''>('');
  const [startingBalance, setStartingBalance] = useState('0.00');
  const [isDefault, setIsDefault] = useState(false);
  const [allowOverdraft, setAllowOverdraft] = useState(false);
  const [overdraftLimit, setOverdraftLimit] = useState('0.00');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCode('');
      setBranchId(branches[0]?.id || '');
      setStartingBalance('0.00');
      setIsDefault(false);
      setAllowOverdraft(false);
      setOverdraftLimit('0.00');
      setNotes('');
      setError(null);
    }
  }, [isOpen, branches]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Drawer name is required.');
      return;
    }
    if (!code.trim()) {
      setError('Drawer code is required.');
      return;
    }
    if (!branchId) {
      setError('Please select a branch.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cashDrawerService.createDrawer({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        branch_id: Number(branchId),
        starting_balance: parseFloat(startingBalance) || 0,
        is_default: isDefault,
        allow_overdraft: allowOverdraft,
        overdraft_limit: parseFloat(overdraftLimit) || 0,
        notes: notes.trim() || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create cash drawer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      title="Create New Cash Drawer"
      subtitle="Register a new till, safe, or counter cash point"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitText={loading ? 'Creating...' : 'Create Cash Drawer'}
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Drawer Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!code) {
                  setCode('CDR-' + e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase());
                }
              }}
              placeholder="e.g. Counter 1 Main Till"
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Drawer Code *
            </label>
            <input
              type="text"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CDR-TILL-01"
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assigned Branch *
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(Number(e.target.value))}
              className="w-full text-xs py-2 px-3 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Initial Starting Balance (₹)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="0.00"
                className="w-full text-xs font-bold pl-7 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Default Drawer for this Branch</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowOverdraft}
              onChange={(e) => setAllowOverdraft(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Allow Overdraft Disbursals</span>
          </label>
        </div>

        {allowOverdraft && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Authorized Overdraft Limit (₹)
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                ₹
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={overdraftLimit}
                onChange={(e) => setOverdraftLimit(e.target.value)}
                placeholder="0.00"
                className="w-full text-xs font-bold pl-7 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Notes & Location
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Ground Floor POS billing counter near main entrance..."
            className="w-full text-xs p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </Modal>
  );
};
