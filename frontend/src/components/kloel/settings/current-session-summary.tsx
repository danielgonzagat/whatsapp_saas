'use client';

import { cn } from '@/lib/utils';
import { Laptop, Monitor, Smartphone } from 'lucide-react';

import type { SecuritySessionSurface } from './security-session-surface';

const iconByDeviceType = {
  mobile: Smartphone,
  desktop: Laptop,
  monitor: Monitor,
} as const;

export function CurrentSessionSummary({
  surface,
  className,
}: {
  surface: SecuritySessionSurface;
  className?: string;
}) {
  const SessionIcon = iconByDeviceType[surface.deviceType];

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-accent-light)] p-3',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <SessionIcon className="h-5 w-5 text-[var(--app-accent)]" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-[var(--app-text-primary)]">{surface.device}</p>
          <p className="text-xs text-[var(--app-text-secondary)]">{surface.detail}</p>
        </div>
      </div>
      <span className="rounded-full bg-[var(--app-accent-light)] px-2 py-0.5 text-xs font-medium text-[var(--app-accent)]">
        Atual
      </span>
    </div>
  );
}
