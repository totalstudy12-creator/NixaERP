import React, { useMemo } from 'react';
import { CashDrawerDenominationItem } from '../../types/cashDrawer';

interface Props {
  denominations: CashDrawerDenominationItem[];
  onChange: (items: CashDrawerDenominationItem[]) => void;
  currencySymbol?: string;
  readOnly?: boolean;
}

export const defaultDenominations: CashDrawerDenominationItem[] = [
  { label: '₹500', value: 500, quantity: 0, amount: 0 },
  { label: '₹200', value: 200, quantity: 0, amount: 0 },
  { label: '₹100', value: 100, quantity: 0, amount: 0 },
  { label: '₹50',  value: 50,  quantity: 0, amount: 0 },
  { label: '₹20',  value: 20,  quantity: 0, amount: 0 },
  { label: '₹10',  value: 10,  quantity: 0, amount: 0 },
  { label: '₹5',   value: 5,   quantity: 0, amount: 0 },
  { label: '₹2',   value: 2,   quantity: 0, amount: 0 },
  { label: '₹1',   value: 1,   quantity: 0, amount: 0 },
  { label: 'Coins', value: 1,  quantity: 0, amount: 0 },
];

export const DenominationCalculator: React.FC<Props> = ({
  denominations,
  onChange,
  currencySymbol = '₹',
  readOnly = false,
}) => {
  const handleQuantityChange = (index: number, rawQty: string | number) => {
    const qty = Math.max(0, parseInt(String(rawQty), 10) || 0);
    const updated = [...denominations];
    updated[index] = {
      ...updated[index],
      quantity: qty,
      amount: Math.round(qty * updated[index].value * 100) / 100,
    };
    onChange(updated);
  };

  const totalAmount = useMemo(() => {
    return denominations.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [denominations]);

  const totalPieces = useMemo(() => {
    return denominations.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [denominations]);

  return (
    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Physical Cash Denominations
          </span>
          <p className="text-xs text-slate-400">Enter note & coin counts to auto-calculate total</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-500 mr-2">Total Count: <strong className="text-slate-800 dark:text-slate-200">{totalPieces} pcs</strong></span>
          <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
            {currencySymbol}{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
        {denominations.map((item, idx) => (
          <div
            key={item.label || idx}
            className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs"
          >
            <div className="w-16">
              <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">
                {item.label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-1 max-w-[130px]">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleQuantityChange(idx, Math.max(0, (item.quantity || 0) - 1))}
                  className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold"
                >
                  -
                </button>
              )}
              <input
                type="number"
                min="0"
                value={item.quantity === 0 ? '' : item.quantity}
                placeholder="0"
                disabled={readOnly}
                onChange={(e) => handleQuantityChange(idx, e.target.value)}
                className="w-16 text-center py-1 px-1 border border-slate-300 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-semibold text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleQuantityChange(idx, (item.quantity || 0) + 1)}
                  className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 text-xs font-bold"
                >
                  +
                </button>
              )}
            </div>

            <div className="w-24 text-right">
              <span className="text-xs text-slate-400 block">Amount</span>
              <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                {currencySymbol}{(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
