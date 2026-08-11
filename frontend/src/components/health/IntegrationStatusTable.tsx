import { IntegrationHealthEntry, HealthConnectionStatus } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';

interface IntegrationStatusTableProps {
  entries: IntegrationHealthEntry[];
  onTestConnection: () => void;
  onSyncNow: () => void;
}

export function IntegrationStatusTable({ entries, onTestConnection, onSyncNow }: IntegrationStatusTableProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.24em]">Third-Party Integrations</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">Connection health and sync status</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={onTestConnection} className="btn btn-outline">Test Connection</button>
          <button onClick={onSyncNow} className="btn btn-primary">Sync Now</button>
        </div>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm text-slate-600">
          <thead className="border-b border-slate-200 text-slate-900">
            <tr>
              <th className="px-4 py-3">Integration</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Response</th>
              <th className="px-4 py-3">Last Success</th>
              <th className="px-4 py-3">Last Failed</th>
              <th className="px-4 py-3">Errors</th>
              <th className="px-4 py-3">Auth</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{entry.name}</td>
                <td className="px-4 py-3"><HealthStatusBadge status={entry.status as HealthConnectionStatus} /></td>
                <td className="px-4 py-3">{entry.responseTimeMs ? `${entry.responseTimeMs} ms` : 'N/A'}</td>
                <td className="px-4 py-3">{entry.lastSuccessfulSync}</td>
                <td className="px-4 py-3">{entry.lastFailedRequest || '—'}</td>
                <td className="px-4 py-3">{entry.errors}</td>
                <td className="px-4 py-3">{entry.authStatus}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-outline px-3 py-1 text-xs">View Logs</button>
                    <button className="btn btn-outline px-3 py-1 text-xs">Configure</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
