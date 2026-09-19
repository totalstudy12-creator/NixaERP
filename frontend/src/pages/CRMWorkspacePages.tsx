import { FormEvent, useMemo, useState } from 'react';
import { FiArrowUpRight, FiClock, FiFilter, FiMail, FiMoreHorizontal, FiPlus, FiSearch, FiTarget, FiUsers } from 'react-icons/fi';

type WorkspaceKind = 'leads' | 'contacts' | 'opportunities' | 'campaigns' | 'quotations';

interface WorkspaceConfig {
  eyebrow: string;
  title: string;
  description: string;
  singular: string;
  action: string;
  columns: string[];
  rows: string[][];
  metrics: { label: string; value: string; tone: string }[];
}

const configs: Record<WorkspaceKind, WorkspaceConfig> = {
  leads: {
    eyebrow: 'CRM · Pipeline', title: 'Leads', description: 'Capture, qualify, and move new prospects into your sales pipeline.', singular: 'lead', action: 'Add lead',
    columns: ['Lead', 'Company', 'Source', 'Owner', 'Status'],
    rows: [['Aarav Mehta', 'Vertex Retail', 'Website', 'Priya Shah', 'New'], ['Nisha Kapoor', 'Orbit Stores', 'Referral', 'Rahul Singh', 'Qualified'], ['Kabir Jain', 'Jain Distribution', 'Campaign', 'Priya Shah', 'Follow-up']],
    metrics: [{ label: 'Open leads', value: '24', tone: 'indigo' }, { label: 'Qualified', value: '12', tone: 'emerald' }, { label: 'Conversion', value: '38%', tone: 'amber' }],
  },
  contacts: {
    eyebrow: 'CRM · Directory', title: 'Contacts', description: 'Keep the people behind every customer, supplier, and opportunity organised.', singular: 'contact', action: 'Add contact',
    columns: ['Contact', 'Company', 'Email', 'Phone', 'Last activity'],
    rows: [['Ananya Gupta', 'Blue Retail', 'ananya@blueretail.in', '+91 98765 43210', 'Today'], ['Vikram Rao', 'North Traders', 'vikram@northtraders.in', '+91 98220 11032', 'Yesterday'], ['Maya Iyer', 'Spark Electronics', 'maya@spark.in', '+91 99000 12345', '12 Sep']],
    metrics: [{ label: 'Total contacts', value: '186', tone: 'indigo' }, { label: 'Recently added', value: '18', tone: 'emerald' }, { label: 'Needs follow-up', value: '9', tone: 'amber' }],
  },
  opportunities: {
    eyebrow: 'CRM · Revenue', title: 'Opportunities', description: 'Track deal value, pipeline stages, and the next action required to close.', singular: 'opportunity', action: 'Create opportunity',
    columns: ['Opportunity', 'Account', 'Value', 'Stage', 'Close date'],
    rows: [['Q4 Store Rollout', 'Vertex Retail', '₹ 2,40,000', 'Proposal', '30 Sep'], ['Distributor Renewal', 'North Traders', '₹ 1,80,000', 'Negotiation', '22 Sep'], ['POS Upgrade', 'Spark Electronics', '₹ 75,000', 'Discovery', '08 Oct']],
    metrics: [{ label: 'Pipeline value', value: '₹ 12.4L', tone: 'indigo' }, { label: 'Closing this month', value: '8', tone: 'emerald' }, { label: 'Win rate', value: '46%', tone: 'amber' }],
  },
  campaigns: {
    eyebrow: 'CRM · Outreach', title: 'Campaigns', description: 'Plan targeted outreach and keep delivery and engagement visible in one place.', singular: 'campaign', action: 'Create campaign',
    columns: ['Campaign', 'Channel', 'Audience', 'Status', 'Performance'],
    rows: [['Festive Wholesale Offer', 'Email', '1,240 contacts', 'Active', '31% opened'], ['New Store Launch', 'WhatsApp', '480 contacts', 'Scheduled', 'Starts 20 Sep'], ['Accessories Bundle', 'SMS', '860 contacts', 'Draft', '—']],
    metrics: [{ label: 'Active campaigns', value: '4', tone: 'indigo' }, { label: 'Recipients reached', value: '3,820', tone: 'emerald' }, { label: 'Avg. engagement', value: '27%', tone: 'amber' }],
  },
  quotations: {
    eyebrow: 'CRM · Sales documents', title: 'Quotations', description: 'Prepare, share, and follow up on proposals before they become sales orders.', singular: 'quotation', action: 'New quotation',
    columns: ['Quote no.', 'Customer', 'Amount', 'Valid until', 'Status'],
    rows: [['QT-2026-041', 'Blue Retail', '₹ 84,500', '28 Sep', 'Sent'], ['QT-2026-040', 'North Traders', '₹ 1,26,000', '24 Sep', 'Viewed'], ['QT-2026-039', 'Spark Electronics', '₹ 45,800', '18 Sep', 'Draft']],
    metrics: [{ label: 'Draft value', value: '₹ 3.8L', tone: 'indigo' }, { label: 'Awaiting reply', value: '11', tone: 'emerald' }, { label: 'Expiring soon', value: '3', tone: 'amber' }],
  },
};

function CRMWorkspacePage({ kind }: { kind: WorkspaceKind }) {
  const config = configs[kind];
  const [rows, setRows] = useState(config.rows);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');

  const visibleRows = useMemo(() => rows.filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query, rows]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const values = Array(config.columns.length).fill('—') as string[];
    values[0] = kind === 'quotations' ? `QT-2026-${String(42 + rows.length).padStart(3, '0')}` : name.trim();
    values[1] = company.trim() || 'Unassigned';
    values[values.length - 1] = kind === 'quotations' ? 'Draft' : kind === 'campaigns' ? 'Draft' : 'New';
    setRows((current) => [values, ...current]);
    setName(''); setCompany(''); setCreating(false);
  };

  return <div className="space-y-6">
    <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-sm">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-300">{config.eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{config.title}</h1><p className="mt-2 text-sm leading-6 text-slate-300">{config.description}</p></div>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold transition hover:bg-indigo-400"><FiPlus /> {config.action}</button>
      </div>
    </section>
    <section className="grid gap-4 md:grid-cols-3">{config.metrics.map((metric) => <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{metric.label}</p><p className={`mt-2 text-2xl font-bold text-${metric.tone}-600`}>{metric.value}</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><FiArrowUpRight className="text-emerald-500" /> Updated today</p></div>)}</section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-sm"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${config.title.toLowerCase()}...`} className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" /></div><button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"><FiFilter /> Filter</button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{config.columns.map((column) => <th key={column} className="px-5 py-3 font-semibold">{column}</th>)}<th className="px-5 py-3" /></tr></thead><tbody className="divide-y divide-slate-100">{visibleRows.map((row, index) => <tr key={`${row[0]}-${index}`} className="hover:bg-slate-50/70">{row.map((value, valueIndex) => <td key={`${value}-${valueIndex}`} className="px-5 py-4 text-slate-600">{valueIndex === 0 ? <span className="font-semibold text-slate-900">{value}</span> : valueIndex === row.length - 1 ? <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{value}</span> : value}</td>)}<td className="px-5 py-4"><button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><FiMoreHorizontal /></button></td></tr>)}</tbody></table></div>
      {visibleRows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">No {config.title.toLowerCase()} match your search.</div>}
    </section>
    {creating && <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">{kind === 'campaigns' ? <FiMail /> : kind === 'opportunities' ? <FiTarget /> : <FiUsers />}</div><div><h2 className="font-semibold text-slate-900">{config.action}</h2><p className="text-xs text-slate-500">Saved locally until backend integration.</p></div></div><label className="mt-5 block text-sm font-medium text-slate-700">Name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-indigo-400" placeholder={`Enter ${config.singular} name`} /></label><label className="mt-4 block text-sm font-medium text-slate-700">Company / account<input value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-indigo-400" placeholder="Optional" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreating(false)} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button><button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Save {config.singular}</button></div></form></div>}
  </div>;
}

export const LeadsPage = () => <CRMWorkspacePage kind="leads" />;
export const ContactsPage = () => <CRMWorkspacePage kind="contacts" />;
export const OpportunitiesPage = () => <CRMWorkspacePage kind="opportunities" />;
export const CampaignsPage = () => <CRMWorkspacePage kind="campaigns" />;
export const QuotationsPage = () => <CRMWorkspacePage kind="quotations" />;
