import { ReactElement } from 'react';
import { HealthStatus } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';

interface HealthSummaryCardProps {
  icon: ReactElement;
  title: string;
  value: string;
  details: string;
  status: HealthStatus;
  trend?: string;
  onClick?: () => void;
}

export function HealthSummaryCard({ icon, title, value, details, status, trend, onClick }: HealthSummaryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-slate-100 text-slate-600 transition group-hover:bg-blue-50">
          {icon}
        </div>
        <HealthStatusBadge status={status} className="text-[10px] font-semibold tracking-[0.25em]" />
      </div>
      <div className="mt-6">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
        <p className="mt-2 text-sm text-slate-500">{details}</p>
      </div>
      {trend && (
        <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
          <span>{trend}</span>
          <span className="font-semibold text-slate-900">View details</span>
        </div>
      )}
    </button>
  );
}
