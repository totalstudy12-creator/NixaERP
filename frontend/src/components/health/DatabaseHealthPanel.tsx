import { DatabaseHealth } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';

interface DatabaseHealthPanelProps {
  data: DatabaseHealth | null;
  loading: boolean;
}

export function DatabaseHealthPanel({ data, loading }: DatabaseHealthPanelProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.24em]">Database Health</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">Connection & query performance</p>
        </div>
        <div>{data ? <HealthStatusBadge status={data.status} /> : null}</div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-3xl bg-slate-100 animate-pulse" />
          ))
        ) : (
          data && [
            { label: 'Connection', value: data.connectionStatus, status: data.status },
            { label: 'Response time', value: `${data.responseTimeMs} ms`, status: data.status },
            { label: 'Database size', value: data.databaseSize, status: data.status },
            { label: 'Active connections', value: data.activeConnections.toString(), status: data.status },
            { label: 'Slow queries', value: data.slowQueries.toString(), status: data.slowQueries > 5 ? 'Warning' : 'Healthy' },
            { label: 'Failed queries', value: data.failedQueries.toString(), status: data.failedQueries > 0 ? 'Warning' : 'Healthy' },
            { label: 'Failed connections', value: data.failedConnections.toString(), status: data.failedConnections > 0 ? 'Warning' : 'Healthy' },
            { label: 'Last backup', value: data.lastBackup, status: data.status },
            { label: 'Backup size', value: data.backupSize, status: data.status },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-lg font-semibold text-slate-900">{item.value}</p>
                <HealthStatusBadge status={item.status} className="text-[10px]" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
