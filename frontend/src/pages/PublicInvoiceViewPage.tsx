import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FiShield,
  FiPrinter,
  FiDownload,
  FiShare2,
  FiCheckCircle,
  FiAlertTriangle,
  FiPhone,
  FiFileText,
  FiArrowLeft,
  FiLock,
  FiRefreshCw,
  FiCopy,
} from 'react-icons/fi';
import { apiClient } from '../api';
import InvoicePrintA4 from '../components/invoice-print/InvoicePrintA4';

export function PublicInvoiceViewPage() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<{
    invoice_no: string;
    company_name: string;
    company_logo?: string | null;
    masked_mobile?: string;
    invoice_date?: string;
    payment_status?: string;
  } | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Verification state
  const [mobileInput, setMobileInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [invoiceData, setInvoiceData] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const loadMeta = async () => {
      setLoading(true);
      try {
        const res: any = await apiClient.getPublicInvoiceMetadata(token);
        if (res?.success) {
          setMetadata(res);
        } else {
          setNotFound(true);
        }
      } catch (err: any) {
        console.error('Failed to load public invoice metadata:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadMeta();
  }, [token]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileInput.trim() || !token) return;

    setVerifying(true);
    setVerifyError(null);

    try {
      const res: any = await apiClient.verifyPublicInvoice(token, mobileInput.trim());
      if (res?.success && res?.data) {
        setInvoiceData(res.data);
        setIsVerified(true);
      } else {
        setVerifyError(res?.message || 'Verification failed. Please check your mobile number.');
      }
    } catch (err: any) {
      console.error('Invoice verification failed:', err);
      setVerifyError(
        err.response?.data?.message ||
          err.message ||
          'Mobile number does not match our records for this invoice.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-semibold text-slate-700">Connecting to secure customer portal...</p>
        </div>
      </div>
    );
  }

  if (notFound || !metadata) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg border border-slate-200">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
            <FiAlertTriangle size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Invoice Not Found</h2>
          <p className="text-xs text-slate-500 mb-6">
            The link you followed may be invalid, expired, or removed. Please contact the business for a new link.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            <FiArrowLeft size={14} /> Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur px-4 py-3 sm:px-6 sticky top-0 z-40 shadow-xs no-print">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {metadata.company_logo ? (
              <img
                src={metadata.company_logo}
                alt={metadata.company_name}
                className="h-8 w-8 rounded-lg object-contain border border-slate-100"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-xs font-extrabold text-white">
                {metadata.company_name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-xs font-bold text-slate-900 uppercase tracking-tight">{metadata.company_name}</h1>
              <p className="text-[11px] text-slate-500 font-mono">Invoice #{metadata.invoice_no}</p>
            </div>
          </div>

          {isVerified && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                {copied ? <FiCheckCircle size={13} className="text-emerald-600" /> : <FiCopy size={13} />}
                {copied ? 'Copied' : 'Share Link'}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <FiPrinter size={14} /> Print / Save PDF
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-3 sm:p-6 flex flex-col items-center justify-start">
        {!isVerified ? (
          /* Mobile Verification Card */
          <div className="w-full max-w-md my-auto rounded-2xl bg-white p-6 sm:p-8 shadow-xl border border-slate-200 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-xs">
                <FiShield size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Verify Your Mobile Number</h2>
              <p className="text-xs text-slate-500 mt-1">
                To view Tax Invoice <strong className="text-slate-800">#{metadata.invoice_no}</strong>, enter your registered mobile number below.
              </p>
              {metadata.masked_mobile && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-mono text-slate-600">
                  <FiLock size={11} className="text-slate-400" />
                  <span>Registered: {metadata.masked_mobile}</span>
                </div>
              )}
            </div>

            {verifyError && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <FiAlertTriangle className="shrink-0 mt-0.5" size={15} />
                <span>{verifyError}</span>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mobile Number
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                    <FiPhone size={14} />
                    <span className="text-xs font-bold text-slate-600 border-r border-slate-200 pr-1.5">+91</span>
                  </div>
                  <input
                    type="tel"
                    value={mobileInput}
                    onChange={(e) => setMobileInput(e.target.value)}
                    placeholder="Enter 10-digit mobile number"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-16 pr-3 text-sm font-semibold text-slate-900 shadow-xs outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400 placeholder:font-normal"
                    autoFocus
                    required
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  No password required. Enter the mobile number provided at the time of purchase.
                </p>
              </div>

              <button
                type="submit"
                disabled={verifying || !mobileInput.trim()}
                className="w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                {verifying ? (
                  <>
                    <FiRefreshCw className="animate-spin" size={14} />
                    Verifying...
                  </>
                ) : (
                  <>
                    <FiCheckCircle size={15} />
                    View My Invoice
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <FiLock size={12} />
              <span>256-bit Encrypted Customer Portal • Nixa ERP</span>
            </div>
          </div>
        ) : (
          /* Unlocked Responsive A4 Invoice View */
          <div className="w-full flex flex-col items-center animate-fadeIn">
            {/* Mobile Print Quick Floating Button */}
            <div className="fixed bottom-4 right-4 z-40 sm:hidden no-print">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-3 text-xs font-bold text-white shadow-xl shadow-indigo-600/30"
              >
                <FiPrinter size={16} /> Print / Save PDF
              </button>
            </div>

            {/* Responsive Printable A4 Component */}
            <div className="w-full flex justify-center">
              <InvoicePrintA4 invoice={invoiceData} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default PublicInvoiceViewPage;
