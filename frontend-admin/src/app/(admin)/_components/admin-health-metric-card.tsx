import { AdminSurface } from '@/components/admin/admin-monitor-ui';
import { AdminRingMeter } from './admin-ring-meter';

export function HealthMetricCard({
  percent,
  color,
  label,
  value,
  description,
}: {
  percent: number;
  color: string;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <AdminSurface className="px-5 py-5 lg:px-6">
      <div className="flex items-center gap-4">
        <AdminRingMeter percent={percent} color={color} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--app-text-tertiary)]">
            {label}
          </div>
          <div className="text-[22px] font-bold text-[var(--app-text-primary)]">{value}</div>
          <div className="mt-1 text-[11px] text-[var(--app-text-secondary)]">{description}</div>
        </div>
      </div>
    </AdminSurface>
  );
}
