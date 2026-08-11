import { ApiHealthEntry, HealthStatus } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';
import { useMemo } from 'react';

interface ApiHealthTableProps {
  entries: ApiHealthEntry[];
  filter: 'All' | 'Healthy' | 'Warning' | 'Critical' | 'Offline';
  onFilterChange: (value: 'All' | 'Healthy' | 'Warning' | 'Critical' | 'Offline') => void;
  onTestApi: () => void;
}

const statuses: Array<'All' | 'Healthy' | 'Warning' | 'Critical' | 'Offline'> = ['All', 'Healthy', 'Warning', 'Critical', 'Offline'];

export function ApiHealthTable({ entries, filter, onFilterChange, onTestApi }: ApiHealthTableProps) {
  const filtered = useMemo(() => {
    if (filter === 'All') return entries;
    return entries.filter((entry) => entry.status === filter);
  }, [entries, filter]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.24em]">API Monitoring</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">Endpoint availability and latency</p>
        </div>
        <button onClick={onTestApi} className="btn btn-primary">Test API</button>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {statuses.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onFilterChange(status)}
            className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${filter === status ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {status}
          </button>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead className="border-b border-slate-200 text-slate-900">
            <tr>
              <th className="px-4 py-3">Endpoint</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Requests</th>
              <th className="px-4 py-3">Errors</th>
              <th className="px-4 py-3">Last Success</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry) => (
              <tr key={`${entry.endpoint}-${entry.method}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-900 font-medium">{entry.endpoint}</td>
                <td className="px-4 py-3 uppercase text-slate-600">{entry.method}</td>
                <td className="px-4 py-3"><HealthStatusBadge status={entry.status as HealthStatus} /></td>
                <td className="px-4 py-3">{entry.responseTimeMs} ms</td>
                <td className="px-4 py-3">{entry.requestCount.toLocaleString()}</td>
                <td className="px-4 py-3">{entry.errors}</td>
                <td className="px-4 py-3">{entry.lastSuccessful}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-outline px-3 py-1 text-xs">Details</button>
                    <button className="btn btn-outline px-3 py-1 text-xs">Retry</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-500">No API endpoints match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
