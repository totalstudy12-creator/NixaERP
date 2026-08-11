export function AutomationPage() {
  const workflows = [
    'Automatic Journal Entries',
    'Auto GST Calculation',
    'Auto Ledger Posting',
    'Auto Payment Matching',
    'Auto Due Reminders',
    'Auto Recurring Bills',
    'Auto Bank Import',
    'Scheduled Financial Reports',
    'AI Error Detection',
    'AI Financial Insights',
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Automation</h1>
        <p className="mt-2 text-sm text-slate-600">Automate accounting routines, compliance steps, reminders, and intelligent financial insights.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {workflows.map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-sm text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
