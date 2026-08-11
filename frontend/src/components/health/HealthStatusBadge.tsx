import clsx from 'clsx';

const STATUS_STYLES: Record<string, string> = {
  Healthy: 'bg-emerald-100 text-emerald-700',
  Warning: 'bg-amber-100 text-amber-700',
  Critical: 'bg-rose-100 text-rose-700',
  Offline: 'bg-slate-100 text-slate-700',
  Connected: 'bg-emerald-100 text-emerald-700',
  Disconnected: 'bg-rose-100 text-rose-700',
  'Authentication Error': 'bg-rose-100 text-rose-700',
};

interface HealthStatusBadgeProps {
  status: string;
  className?: string;
  dot?: boolean;
}

export function HealthStatusBadge({ status, className, dot = false }: HealthStatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
        STATUS_STYLES[status] || 'bg-slate-100 text-slate-700',
        className
      )}
    >
      {dot && <span className="h-2.5 w-2.5 rounded-full bg-current opacity-80" />}
      {status}
    </span>
  );
}
