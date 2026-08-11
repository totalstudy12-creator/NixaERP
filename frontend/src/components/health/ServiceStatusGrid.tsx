import { HealthStatus, HealthConnectionStatus } from '../../services/healthService';
import { HealthStatusBadge } from './HealthStatusBadge';

export interface ServiceStatusItem {
  name: string;
  status: HealthStatus | HealthConnectionStatus;
}

interface ServiceStatusGridProps {
  items: ServiceStatusItem[];
}

export function ServiceStatusGrid({ items }: ServiceStatusGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.name} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{item.name}</p>
              <p className="mt-2 text-sm text-slate-500">Service status</p>
            </div>
            <HealthStatusBadge status={item.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
