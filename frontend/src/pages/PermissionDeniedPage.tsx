import { ArrowLeft, LayoutDashboard, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PermissionDeniedPage() {
  const navigate = useNavigate();

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-md bg-rose-50 text-rose-700" aria-hidden="true">
        <ShieldAlert size={28} strokeWidth={1.8} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">403 · Access denied</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">You can’t access this page</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        You don’t have permission to view this page. Contact your administrator if you believe you need access.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft size={16} />
          Go back
        </button>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
        >
          <LayoutDashboard size={16} />
          Go to dashboard
        </button>
      </div>
    </main>
  );
}