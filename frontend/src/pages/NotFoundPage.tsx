import { Link } from 'react-router-dom';
import { FiAlertCircle, FiArrowLeft, FiHome } from 'react-icons/fi';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <FiAlertCircle className="h-7 w-7" />
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">404 · Route Not Found</p>
      <h1 className="mt-2 text-3xl font-bold text-slate-900">Page Not Found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500 leading-relaxed">
        The route or module you requested does not exist or may have been reorganized.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-sm"
        >
          <FiHome className="h-4 w-4" /> Back to Dashboard
        </Link>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <FiArrowLeft className="h-4 w-4" /> Go Back
        </button>
      </div>
    </div>
  );
}
