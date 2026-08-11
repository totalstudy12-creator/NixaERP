export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-600">404</p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">The module you are looking for does not exist or is not yet available in this workspace.</p>
      <a href="/dashboard" className="mt-6 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white">Back to dashboard</a>
    </div>
  );
}
