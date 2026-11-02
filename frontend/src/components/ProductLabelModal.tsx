import React, { useState, useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { BarcodeSVG } from './BarcodeSVG';
import { apiClient } from '../api';
import { FiPrinter, FiDownload, FiRefreshCw, FiX, FiCheck, FiTag, FiLayers } from 'react-icons/fi';

export interface ProductLabelItem {
  id: number;
  name: string;
  sku: string;
  barcode?: string | null;
  qr_code?: string | null;
  sale_price?: number | string | null;
  unit?: string | null;
  company?: { name?: string } | null;
}

export interface ProductLabelModalProps {
  product?: ProductLabelItem | null;
  products?: ProductLabelItem[];
  isOpen: boolean;
  onClose: () => void;
  onProductUpdated?: (updated: any) => void;
}

export function ProductLabelModal({
  product,
  products,
  isOpen,
  onClose,
  onProductUpdated,
}: ProductLabelModalProps) {
  const activeProducts: ProductLabelItem[] = React.useMemo(() => {
    if (products && products.length > 0) return products;
    if (product) return [product];
    return [];
  }, [product, products]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [labelSize, setLabelSize] = useState<'standard' | 'compact' | 'shipping' | 'retail'>('standard');
  const [showName, setShowName] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showQr, setShowQr] = useState(true);
  const [copies, setCopies] = useState(1);
  const [regeneratingBarcode, setRegeneratingBarcode] = useState(false);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<ProductLabelItem | null>(null);

  useEffect(() => {
    if (activeProducts.length > 0) {
      setCurrentProduct(activeProducts[selectedIndex] || activeProducts[0]);
    } else {
      setCurrentProduct(null);
    }
  }, [activeProducts, selectedIndex]);

  if (!isOpen || activeProducts.length === 0 || !currentProduct) return null;

  const isBulk = activeProducts.length > 1;
  const barcodeValue = currentProduct.barcode || currentProduct.sku || `PRD-${currentProduct.id}`;
  const qrValue = currentProduct.qr_code || `NIXA-PRD-${currentProduct.id}-${currentProduct.sku}`;
  const priceDisplay = currentProduct.sale_price != null ? `₹${Number(currentProduct.sale_price).toFixed(2)}` : '';

  const handleRegenerateBarcode = async () => {
    if (!window.confirm('Regenerate a new unique barcode for this product? Existing printed labels will need to be replaced.')) return;
    setRegeneratingBarcode(true);
    try {
      const res: any = await apiClient.regenerateBarcode(currentProduct.id);
      const updated = res.data || res;
      setCurrentProduct(updated);
      onProductUpdated?.(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate barcode');
    } finally {
      setRegeneratingBarcode(false);
    }
  };

  const handleRegenerateQr = async () => {
    if (!window.confirm('Regenerate a new QR identifier for this product?')) return;
    setRegeneratingQr(true);
    try {
      const res: any = await apiClient.regenerateQr(currentProduct.id);
      const updated = res.data || res;
      setCurrentProduct(updated);
      onProductUpdated?.(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to regenerate QR code');
    } finally {
      setRegeneratingQr(false);
    }
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const labelHtml = activeProducts
      .map((item) => {
        const itemBarcodeHtml =
          document.querySelector(`#bulk-item-${item.id} .item-barcode`)?.innerHTML ||
          document.getElementById('modal-barcode-container')?.innerHTML ||
          '';
        const itemQrHtml =
          document.querySelector(`#bulk-item-${item.id} .item-qr`)?.innerHTML ||
          document.getElementById('modal-qr-container')?.innerHTML ||
          '';
        const itemPrice = item.sale_price != null ? `₹${Number(item.sale_price).toFixed(2)}` : '';

        return Array.from({ length: copies })
          .map(
            () => `
          <div class="label-card ${labelSize}">
            ${showName ? `<div class="product-name">${item.name}</div>` : ''}
            ${showSku ? `<div class="product-sku">SKU: ${item.sku} ${item.unit ? `• ${item.unit}` : ''}</div>` : ''}
            <div class="codes-row">
              ${showBarcode ? `<div class="barcode-container">${itemBarcodeHtml}</div>` : ''}
              ${showQr ? `<div class="qr-container">${itemQrHtml}</div>` : ''}
            </div>
            ${showPrice && itemPrice ? `<div class="product-price">MRP: ${itemPrice}</div>` : ''}
          </div>
        `
          )
          .join('');
      })
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Labels - ${isBulk ? `${activeProducts.length} Items` : currentProduct.sku}</title>
          <style>
            @page {
              margin: 0;
              size: auto;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              margin: 4mm;
              padding: 0;
              display: flex;
              flex-wrap: wrap;
              gap: 4mm;
            }
            .label-card {
              border: 1px dashed #cbd5e1;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 2mm;
              page-break-inside: avoid;
              background: white;
            }
            .label-card.standard { width: 50mm; height: 38mm; }
            .label-card.compact  { width: 40mm; height: 25mm; }
            .label-card.retail   { width: 50mm; height: 25mm; }
            .label-card.shipping { width: 100mm; height: 50mm; }

            .product-name {
              font-size: 11px;
              font-weight: 700;
              text-align: center;
              max-width: 95%;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              margin-bottom: 1mm;
            }
            .product-sku {
              font-size: 9px;
              color: #475569;
              text-align: center;
              font-family: monospace;
              margin-bottom: 1mm;
            }
            .codes-row {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 2mm;
              margin-bottom: 1mm;
            }
            .barcode-container svg {
              max-height: 18mm;
              max-width: 32mm;
            }
            .qr-container svg {
              max-height: 16mm;
              max-width: 16mm;
            }
            .product-price {
              font-size: 11px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 0.5mm;
            }
            @media print {
              body { margin: 0; }
              .label-card { border: none; }
            }
          </style>
        </head>
        <body>
          ${labelHtml}
          <script>
            window.onload = function() {
              window.print();
              window.onafterprint = function() { window.close(); }
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleDownloadSVG = () => {
    const svgElem = document.querySelector('#modal-barcode-container svg');
    if (!svgElem) return;
    const svgData = new XMLSerializer().serializeToString(svgElem);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barcode-${currentProduct.sku}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      {/* Hidden container for rendering bulk item barcode/QR elements */}
      <div style={{ display: 'none' }}>
        {activeProducts.map((p) => (
          <div id={`bulk-item-${p.id}`} key={p.id}>
            <div className="item-barcode">
              <BarcodeSVG value={p.barcode || p.sku || `PRD-${p.id}`} width={1.8} height={40} fontSize={10} />
            </div>
            <div className="item-qr">
              <QRCodeSVG value={p.qr_code || `NIXA-PRD-${p.id}-${p.sku}`} size={64} level="M" />
            </div>
          </div>
        ))}
      </div>

      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm">
              {isBulk ? <FiLayers size={18} /> : <FiTag size={18} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isBulk ? `Print Barcode & QR Labels (${activeProducts.length} Items)` : 'Product Barcode & QR Code'}
              </h2>
              <p className="text-xs text-slate-500">
                {isBulk
                  ? `Batch label printing for ${activeProducts.length} selected products`
                  : `${currentProduct.name} (SKU: ${currentProduct.sku})`}
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

        {/* Bulk item preview selector if multiple */}
        {isBulk && (
          <div className="border-b border-slate-100 bg-indigo-50/50 px-6 py-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-900">
              Previewing Item {selectedIndex + 1} of {activeProducts.length}:
            </span>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="text-xs font-medium rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-slate-700 outline-none"
            >
              {activeProducts.map((p, idx) => (
                <option key={p.id} value={idx}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Customization options */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Label Format & Layout</h3>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Standard Thermal Label Size</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'standard', name: 'Standard (50x38mm)' },
                    { id: 'compact', name: 'Compact (40x25mm)' },
                    { id: 'retail', name: 'Jewelry / Shelf (50x25mm)' },
                    { id: 'shipping', name: 'Shipping Box (100x50mm)' },
                  ].map((size) => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setLabelSize(size.id as any)}
                      className={`rounded-lg border p-2.5 text-left font-medium transition ${
                        labelSize === size.id
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/10'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {size.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Visible Elements on Label</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={showName}
                      onChange={(e) => setShowName(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Product Name</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={showSku}
                      onChange={(e) => setShowSku(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>SKU & Unit</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={showBarcode}
                      onChange={(e) => setShowBarcode(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Barcode (128)</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={showQr}
                      onChange={(e) => setShowQr(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>QR Code</span>
                  </label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 cursor-pointer hover:bg-slate-50 col-span-2">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>MRP / Selling Price ({priceDisplay || 'No price'})</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Copies {isBulk ? 'per product' : ''}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                  />
                  <span className="text-xs text-slate-500">
                    Total labels to print: <strong className="text-slate-800">{copies * activeProducts.length}</strong>
                  </span>
                </div>
              </div>

              {!isBulk && (
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleRegenerateBarcode}
                    disabled={regeneratingBarcode}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FiRefreshCw className={regeneratingBarcode ? 'animate-spin' : ''} size={12} />
                    Regenerate Barcode
                  </button>
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={regeneratingQr}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <FiRefreshCw className={regeneratingQr ? 'animate-spin' : ''} size={12} />
                    Regenerate QR
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSVG}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 ml-auto"
                  >
                    <FiDownload size={12} />
                    SVG
                  </button>
                </div>
              )}
            </div>

            {/* Right: Live Label Preview */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Live Label Preview</span>

              {/* Physical-scale style simulated thermal label */}
              <div
                className={`bg-white rounded-lg shadow-md border border-slate-200 flex flex-col items-center justify-center p-3 text-center transition-all ${
                  labelSize === 'compact'
                    ? 'w-48 h-32'
                    : labelSize === 'retail'
                    ? 'w-56 h-32'
                    : labelSize === 'shipping'
                    ? 'w-72 h-44'
                    : 'w-56 h-40'
                }`}
              >
                {showName && (
                  <div className="text-xs font-bold text-slate-800 truncate w-full px-1">{currentProduct.name}</div>
                )}
                {showSku && (
                  <div className="text-[10px] font-mono text-slate-500 mb-1">
                    SKU: {currentProduct.sku} {currentProduct.unit ? `• ${currentProduct.unit}` : ''}
                  </div>
                )}

                <div className="flex items-center justify-center gap-2 my-auto">
                  {showBarcode && (
                    <div id="modal-barcode-container" className="flex flex-col items-center">
                      <BarcodeSVG value={barcodeValue} width={1.8} height={36} fontSize={9} />
                    </div>
                  )}
                  {showQr && (
                    <div id="modal-qr-container" className="p-1 bg-white rounded border border-slate-100">
                      <QRCodeSVG value={qrValue} size={labelSize === 'compact' ? 44 : 56} level="M" />
                    </div>
                  )}
                </div>

                {showPrice && priceDisplay && (
                  <div className="text-xs font-extrabold text-slate-900 mt-1">MRP: {priceDisplay}</div>
                )}
              </div>

              <div className="mt-3 text-[11px] text-slate-400 text-center">
                Supports Standard Thermal Printers (TSC, Zebra, Xprinter, TVS, Dymo, Brother)
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/70">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <FiPrinter size={14} />
            Print {copies * activeProducts.length} {copies * activeProducts.length === 1 ? 'Label' : 'Labels'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductLabelModal;
