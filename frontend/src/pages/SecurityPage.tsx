export function SecurityPage() {
  const items = [
    { title: 'Role-Based Access Control', detail: 'Grant permissions by role, module, and company branch.' },
    { title: 'Approval Workflow', detail: 'Require dual approvals for payments, journals, and stock adjustments.' },
    { title: 'Multi-Level Approvals', detail: 'Escalate sensitive activities to higher authorities.' },
    { title: 'Branch-Level Access', detail: 'Enforce data access boundaries by branch and warehouse.' },
    { title: 'Department-Level Access', detail: 'Limit transactions by department and approval rules.' },
    { title: 'Encryption of Financial Data', detail: 'Protect ledger and payment data using modern encryption standards.' },
    { title: 'Complete Activity Logs', detail: 'Track every financial and system action with timestamps and users.' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Security & Controls</h1>
        <p className="mt-2 text-sm text-slate-600">Implement strict controls for approvals, branch-based access, and traceable financial activity.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-900">{item.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
