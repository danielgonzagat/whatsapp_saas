'use client';

import { SettingsMetricTile } from './contract';

interface SettingsStatCardProps {
  title: string;
  value: string;
  hint?: string;
  /** When true, renders the title in uppercase with tracking. */
  uppercase?: boolean;
}

/** Settings stat card — shared by analytics and CRM settings sections. */
export function SettingsStatCard({ title, value, hint, uppercase }: SettingsStatCardProps) {
  const titleClass = uppercase
    ? 'text-xs font-medium uppercase tracking-[0.18em] text-[var(--app-text-secondary)]'
    : 'text-xs font-medium text-[var(--app-text-secondary)]';

  return (
    <SettingsMetricTile>
      <p className={titleClass}>{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--app-text-primary)]">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{hint}</p>
      ) : null}
    </SettingsMetricTile>
  );
}
