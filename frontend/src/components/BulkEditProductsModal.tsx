import React, { useState, useMemo } from 'react';
import {
  FiX,
  FiCheck,
  FiAlertTriangle,
  FiDollarSign,
  FiPackage,
  FiLayers,
  FiRefreshCw,
  FiZap,
  FiTag,
  FiMaximize,
} from 'react-icons/fi';
import { apiClient } from '../api';

export interface BulkEditProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Array<{
    id: number;
    name: string;
    sku: string;
    barcode?: string | null;
    qr_code?: string | null;
    brand?: string | null;
    unit?: string | null;
    sale_price: number | string;
    purchase_price?: number | string | null;
    stock_quantity: number | string;
  }>;
  warehouses: Array<{ id: number; name: string }>;
  canEditPurchasePrice: boolean;
  onSuccess: (count: number) => void;
}

export function BulkEditProductsModal({
  isOpen,
  onClose,
  selectedProducts,
  warehouses,
  canEditPurchasePrice,
  onSuccess,
}: BulkEditProductsModalProps) {
  if (!isOpen) return null;

  // AI Assistant State
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPlan, setAiPlan] = useState<any | null>(null);

  // Auto-generation State
  const [autoGenerateSku, setAutoGenerateSku] = useState(false);
  const [autoGenerateBarcode, setAutoGenerateBarcode] = useState(false);
  const [autoGenerateQr, setAutoGenerateQr] = useState(false);

  // Sale Price State
  const [salePriceAction, setSalePriceAction] = useState<
    'keep' | 'set' | 'increase_percent' | 'decrease_percent' | 'increase_fixed' | 'decrease_fixed'
  >('keep');
  const [salePriceValue, setSalePriceValue] = useState<string>('');

  // Purchase Price State
  const [purchasePriceAction, setPurchasePriceAction] = useState<
    'keep' | 'set' | 'increase_percent' | 'decrease_percent' | 'increase_fixed' | 'decrease_fixed'
  >('keep');
  const [purchasePriceValue, setPurchasePriceValue] = useState<string>('');

  // Stock Quantity State
  const [stockAction, setStockAction] = useState<'keep' | 'set' | 'add' | 'subtract'>('keep');
  const [stockValue, setStockValue] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [remark, setRemark] = useState<string>('Bulk price & stock adjustment');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAiSuggest = async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? aiInstruction).trim();
    if (!prompt) return;

    setAiLoading(true);
    setErrorMsg(null);
    try {
      const res: any = await apiClient.aiBulkSuggest(prompt, selectedProducts);
      const data = res?.data ?? res;
      if (data) {
        setAiPlan(data);
        if (data.sale_price_action && data.sale_price_action !== 'keep') {
          setSalePriceAction(data.sale_price_action);
          if (data.sale_price_value != null) setSalePriceValue(String(data.sale_price_value));
        }
        if (canEditPurchasePrice && data.purchase_price_action && data.purchase_price_action !== 'keep') {
          setPurchasePriceAction(data.purchase_price_action);
          if (data.purchase_price_value != null) setPurchasePriceValue(String(data.purchase_price_value));
        }
        if (data.stock_quantity_action && data.stock_quantity_action !== 'keep') {
          setStockAction(data.stock_quantity_action);
          if (data.stock_quantity_value != null) setStockValue(String(data.stock_quantity_value));
        }
        if (data.auto_generate_sku) setAutoGenerateSku(true);
        if (data.auto_generate_barcode) setAutoGenerateBarcode(true);
      }
    } catch (err: any) {
      console.error('AI bulk suggest error:', err);
      setErrorMsg(err.message || 'AI assistant could not analyze instruction.');
    } finally {
      setAiLoading(false);
    }
  };

  // Compute projected changes for preview
  const previewItems = useMemo(() => {
    const spVal = parseFloat(salePriceValue) || 0;
    const ppVal = parseFloat(purchasePriceValue) || 0;
    const sqVal = parseFloat(stockValue) || 0;

    return selectedProducts.map((p) => {
      const curSp = parseFloat(String(p.sale_price)) || 0;
      let newSp = curSp;
      if (salePriceAction === 'set') newSp = spVal;
      else if (salePriceAction === 'increase_percent') newSp = curSp * (1 + spVal / 100);
      else if (salePriceAction === 'decrease_percent') newSp = Math.max(0, curSp * (1 - spVal / 100));
      else if (salePriceAction === 'increase_fixed') newSp = curSp + spVal;
      else if (salePriceAction === 'decrease_fixed') newSp = Math.max(0, curSp - spVal);

      const curPp = parseFloat(String(p.purchase_price)) || 0;
      let newPp = curPp;
      if (canEditPurchasePrice) {
        if (purchasePriceAction === 'set') newPp = ppVal;
        else if (purchasePriceAction === 'increase_percent') newPp = curPp * (1 + ppVal / 100);
        else if (purchasePriceAction === 'decrease_percent') newPp = Math.max(0, curPp * (1 - ppVal / 100));
        else if (purchasePriceAction === 'increase_fixed') newPp = curPp + ppVal;
        else if (purchasePriceAction === 'decrease_fixed') newPp = Math.max(0, curPp - ppVal);
      }

      const curStock = parseFloat(String(p.stock_quantity)) || 0;
      let newStock = curStock;
      if (stockAction === 'set') newStock = sqVal;
      else if (stockAction === 'add') newStock = curStock + sqVal;
      else if (stockAction === 'subtract') newStock = curStock - sqVal;

      return {
        ...p,
        oldSp: curSp,
        newSp: Math.round(newSp * 100) / 100,
        oldPp: curPp,
        newPp: Math.round(newPp * 100) / 100,
        oldStock: curStock,
        newStock: Math.round(newStock * 1000) / 1000,
        willGenSku: autoGenerateSku,
        willGenBarcode: autoGenerateBarcode,
      };
    });
  }, [
    selectedProducts,
    salePriceAction,
    salePriceValue,
    purchasePriceAction,
    purchasePriceValue,
    stockAction,
    stockValue,
    canEditPurchasePrice,
    autoGenerateSku,
    autoGenerateBarcode,
  ]);

  const hasAnyChanges =
    (salePriceAction !== 'keep' && salePriceValue !== '') ||
    (purchasePriceAction !== 'keep' && purchasePriceValue !== '') ||
    (stockAction !== 'keep' && stockValue !== '') ||
    autoGenerateSku ||
    autoGenerateBarcode ||
    autoGenerateQr;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasAnyChanges) {
      setErrorMsg('Please select at least one price, stock, or code modification to apply.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, any> = {
        product_ids: selectedProducts.map((p) => p.id),
        remark: remark.trim() || 'Bulk inventory edit',
      };

      if (salePriceAction !== 'keep' && salePriceValue !== '') {
        payload.sale_price_action = salePriceAction;
        payload.sale_price_value = parseFloat(salePriceValue);
      }

      if (canEditPurchasePrice && purchasePriceAction !== 'keep' && purchasePriceValue !== '') {
        payload.purchase_price_action = purchasePriceAction;
        payload.purchase_price_value = parseFloat(purchasePriceValue);
      }

      if (stockAction !== 'keep' && stockValue !== '') {
        payload.stock_quantity_action = stockAction;
        payload.stock_quantity_value = parseFloat(stockValue);
        if (selectedWarehouseId) {
          payload.warehouse_id = parseInt(selectedWarehouseId, 10);
        }
      }

      if (autoGenerateSku) payload.auto_generate_sku = true;
      if (autoGenerateBarcode) payload.auto_generate_barcode = true;
      if (autoGenerateQr) payload.auto_generate_qr = true;

      const res: any = await apiClient.bulkEditProducts(payload);
      const count = res?.updated_count ?? selectedProducts.length;
      onSuccess(count);
      onClose();
    } catch (err: any) {
      console.error('Bulk edit failed:', err);
      setErrorMsg(err.message || 'Failed to apply bulk updates. Please check values and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <FiLayers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">Bulk Edit Prices, QTY &amp; Codes</h2>
                <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700 border border-purple-200">
                  <FiZap size={10} /> AI Powered
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Updating <span className="font-semibold text-indigo-600">{selectedProducts.length} selected items</span> simultaneously
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700">
              <FiAlertTriangle className="shrink-0" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* AI Bulk Assistant Card */}
          <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50/80 via-indigo-50/50 to-blue-50/80 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-600 text-white">
                  <FiZap size={14} />
                </div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-purple-900">
                  AI Batch Pricing &amp; Inventory Assistant
                </h3>
              </div>
              <span className="text-[11px] text-purple-700 font-medium">Natural Language Prompt</span>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAiSuggest();
                  }
                }}
                placeholder="e.g. 'Increase sale prices by 15% and generate unique SKUs', or 'Discount by 8%'"
                className="flex-1 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/15"
              />
              <button
                type="button"
                onClick={() => handleAiSuggest()}
                disabled={aiLoading || !aiInstruction.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 shrink-0"
              >
                <FiZap className={aiLoading ? 'animate-spin' : ''} size={12} />
                {aiLoading ? 'Analyzing...' : 'Suggest with AI'}
              </button>
            </div>

            {/* Quick Suggestion Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 font-medium mr-1">Quick prompts:</span>
              {[
                '+10% Sale Price',
                '+15% Margin & Deduct 2 Stock',
                '-5% Clearance Discount',
                'Auto Generate Unique SKUs & Barcodes',
              ].map((pill, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setAiInstruction(pill);
                    handleAiSuggest(pill);
                  }}
                  className="rounded-md border border-purple-200 bg-white/80 px-2 py-0.5 text-purple-700 hover:bg-purple-100 transition"
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* AI Summary Banner */}
            {aiPlan && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <FiCheck className="text-emerald-600" size={14} />
                  {aiPlan.summary || 'AI adjustment plan formulated:'}
                </div>
                {aiPlan.tips?.map((t: string, i: number) => (
                  <div key={i} className="text-[11px] text-emerald-700">💡 {t}</div>
                ))}
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* 1. Sale Price Adjustment Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition">
              <div className="flex items-center gap-2 mb-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <FiDollarSign size={15} />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">Sale Price (Selling Rate)</h3>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Modification Type</label>
                  <select
                    value={salePriceAction}
                    onChange={(e) => setSalePriceAction(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                  >
                    <option value="keep">Do not change sale price</option>
                    <option value="set">Set fixed price (₹)</option>
                    <option value="increase_percent">Increase by percentage (+%)</option>
                    <option value="decrease_percent">Decrease by percentage (-%)</option>
                    <option value="increase_fixed">Increase by fixed amount (+₹)</option>
                    <option value="decrease_fixed">Decrease by fixed amount (-₹)</option>
                  </select>
                </div>

                {salePriceAction !== 'keep' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {salePriceAction.includes('percent') ? 'Percentage (%)' : 'Amount (₹)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={salePriceValue}
                      onChange={(e) => setSalePriceValue(e.target.value)}
                      placeholder={salePriceAction.includes('percent') ? 'e.g. 10 for +10%' : 'e.g. 150.00'}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      required
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 2. Purchase Price Adjustment Card (Permission Guarded) */}
            {canEditPurchasePrice ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition">
                <div className="flex items-center gap-2 mb-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600">
                    <FiDollarSign size={15} />
                  </span>
                  <h3 className="text-sm font-semibold text-slate-800">Purchase Price (Cost)</h3>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Modification Type</label>
                    <select
                      value={purchasePriceAction}
                      onChange={(e) => setPurchasePriceAction(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                    >
                      <option value="keep">Do not change purchase cost</option>
                      <option value="set">Set fixed cost (₹)</option>
                      <option value="increase_percent">Increase by percentage (+%)</option>
                      <option value="decrease_percent">Decrease by percentage (-%)</option>
                      <option value="increase_fixed">Increase by fixed amount (+₹)</option>
                      <option value="decrease_fixed">Decrease by fixed amount (-₹)</option>
                    </select>
                  </div>

                  {purchasePriceAction !== 'keep' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {purchasePriceAction.includes('percent') ? 'Percentage (%)' : 'Amount (₹)'}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={purchasePriceValue}
                        onChange={(e) => setPurchasePriceValue(e.target.value)}
                        placeholder={purchasePriceAction.includes('percent') ? 'e.g. 5 for +5%' : 'e.g. 100.00'}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                        required
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 flex items-center justify-center text-center text-xs text-slate-400">
                Purchase price editing restricted by permission.
              </div>
            )}

            {/* 3. Stock Quantity Adjustment Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition md:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600">
                  <FiPackage size={15} />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">Stock Quantity Adjustment</h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Stock Action</label>
                  <select
                    value={stockAction}
                    onChange={(e) => setStockAction(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                  >
                    <option value="keep">Do not change stock</option>
                    <option value="set">Set exact quantity</option>
                    <option value="add">Add stock (+)</option>
                    <option value="subtract">Deduct stock (-)</option>
                  </select>
                </div>

                {stockAction !== 'keep' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Quantity (Decimal supported)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={stockValue}
                      onChange={(e) => setStockValue(e.target.value)}
                      placeholder="e.g. 10, 2.500"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                      required
                    />
                  </div>
                )}

                {stockAction !== 'keep' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Target Warehouse (Optional)</label>
                    <select
                      value={selectedWarehouseId}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                    >
                      <option value="">Default / First warehouse</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {stockAction !== 'keep' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Adjustment Reason / Remark</label>
                  <input
                    type="text"
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="Audit reason for stock movement..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10"
                  />
                </div>
              )}
            </div>

            {/* 4. Auto-Generate Unique SKU & Barcode Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-indigo-200 transition md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
                  <FiTag size={15} />
                </span>
                <h3 className="text-sm font-semibold text-slate-800">
                  Auto-Generate Unique SKU &amp; Barcode Identifiers
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Guarantees collision-free unique identifiers across the database for all selected products.
              </p>

              <div className="grid gap-3 sm:grid-cols-3 text-xs">
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={autoGenerateSku}
                    onChange={(e) => setAutoGenerateSku(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Auto-Generate Unique SKUs</span>
                    <span className="text-[10px] text-slate-500">Format: PRD-NAME-XXXX</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={autoGenerateBarcode}
                    onChange={(e) => setAutoGenerateBarcode(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Auto-Generate Unique Barcodes</span>
                    <span className="text-[10px] text-slate-500">GS1 / EAN-13 compatible</span>
                  </div>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={autoGenerateQr}
                    onChange={(e) => setAutoGenerateQr(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500/20"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 block">Auto-Generate 2D QR Codes</span>
                    <span className="text-[10px] text-slate-500">High-density payload</span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Live Preview Table */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Live Changes Preview ({selectedProducts.length} items)
              </h4>
              <span className="text-[11px] text-slate-500">
                {hasAnyChanges ? 'Review projected updates below before applying' : 'Select changes above to preview'}
              </span>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Product / SKU</th>
                    <th className="py-2 px-3">Sale Price</th>
                    {canEditPurchasePrice && <th className="py-2 px-3">Cost Price</th>}
                    <th className="py-2 px-3">Stock Qty</th>
                    {(autoGenerateSku || autoGenerateBarcode) && <th className="py-2 px-3">Codes to Generate</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewItems.slice(0, 10).map((p) => {
                    const spChanged = p.oldSp !== p.newSp;
                    const ppChanged = p.oldPp !== p.newPp;
                    const stockChanged = p.oldStock !== p.newStock;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-medium text-slate-800 truncate max-w-[200px]">{p.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{p.sku}</div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {spChanged ? (
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="line-through text-slate-400 text-[11px]">₹{p.oldSp.toFixed(2)}</span>
                              <span className="text-emerald-600 font-bold">₹{p.newSp.toFixed(2)}</span>
                            </div>
                          ) : (
                            <span className="text-slate-600">₹{p.oldSp.toFixed(2)}</span>
                          )}
                        </td>
                        {canEditPurchasePrice && (
                          <td className="py-2 px-3 whitespace-nowrap">
                            {ppChanged ? (
                              <div className="flex items-center gap-1.5 font-medium">
                                <span className="line-through text-slate-400 text-[11px]">₹{p.oldPp.toFixed(2)}</span>
                                <span className="text-blue-600 font-bold">₹{p.newPp.toFixed(2)}</span>
                              </div>
                            ) : (
                              <span className="text-slate-600">₹{p.oldPp.toFixed(2)}</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 px-3 whitespace-nowrap">
                          {stockChanged ? (
                            <div className="flex items-center gap-1.5 font-medium">
                              <span className="line-through text-slate-400 text-[11px]">{p.oldStock}</span>
                              <span className="text-indigo-600 font-bold">
                                {p.newStock} {p.unit || ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">
                              {p.oldStock} {p.unit || ''}
                            </span>
                          )}
                        </td>
                        {(autoGenerateSku || autoGenerateBarcode) && (
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {autoGenerateSku && (
                                <span className="rounded bg-indigo-50 text-indigo-700 px-1.5 py-0.2 text-[10px] font-semibold">
                                  + New SKU
                                </span>
                              )}
                              {autoGenerateBarcode && (
                                <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.2 text-[10px] font-semibold">
                                  + New Barcode
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {selectedProducts.length > 10 && (
                <div className="p-2 text-center text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                  + {selectedProducts.length - 10} more items will also be updated
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !hasAnyChanges}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <FiRefreshCw className="animate-spin" size={13} />
                  Applying Changes...
                </>
              ) : (
                <>
                  <FiCheck size={14} />
                  Apply to {selectedProducts.length} Products
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BulkEditProductsModal;
