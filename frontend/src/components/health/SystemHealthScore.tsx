import { HealthStatus } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';

interface SystemHealthScoreProps {
  score: number;
  uptimePercentage: number;
  healthyServices: number;
  warningServices: number;
  criticalServices: number;
  offlineServices: number;
  status: HealthStatus;
}

export function SystemHealthScore({ score, uptimePercentage, healthyServices, warningServices, criticalServices, offlineServices, status }: SystemHealthScoreProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500 uppercase tracking-[0.24em]">System Health Score</p>
          <div className="mt-3 flex items-center gap-4">
            <p className="text-5xl font-semibold text-slate-900">{score.toFixed(1)}%</p>
            <HealthStatusBadge status={status} />
          </div>
          <p className="mt-2 text-sm text-slate-500">Uptime target: {uptimePercentage.toFixed(2)}%</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Healthy</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">{healthyServices}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Warning</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{warningServices}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Critical</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">{criticalServices}</p>
          </div>
          <div className="rounded-3xl bg-slate-50 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Offline</p>
            <p className="mt-2 text-2xl font-semibold text-slate-700">{offlineServices}</p>
          </div>
        </div>
      </div>
      <div className="mt-6 h-4 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-cyan-500 to-sky-500" style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} />
      </div>
    </div>
  );
}
