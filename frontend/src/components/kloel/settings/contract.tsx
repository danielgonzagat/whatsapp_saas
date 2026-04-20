'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes, ReactNode } from 'react';

/** Kloel settings class. */
export const kloelSettingsClass = {
  sectionTitle: 'text-lg font-semibold text-[var(--app-text-primary)]',
  sectionDescription: 'text-sm text-[var(--app-text-secondary)]',
  card: 'rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-5 shadow-none',
  cardTitle: 'text-lg font-semibold text-[var(--app-text-primary)]',
  cardDescription: 'text-sm text-[var(--app-text-secondary)]',
  label: 'text-xs text-[var(--app-text-secondary)]',
  inset: 'rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)]',
  insetSoft: 'rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-secondary)]',
  metricTile: 'rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] p-4',
  input:
    'rounded-md border-[var(--app-border-input)] bg-[var(--app-bg-input)] text-[var(--app-text-primary)] placeholder:text-[var(--app-text-placeholder)] shadow-none focus-visible:border-[var(--app-border-focus)]',
  textarea:
    'rounded-md border-[var(--app-border-input)] bg-[var(--app-bg-input)] text-[var(--app-text-primary)] placeholder:text-[var(--app-text-placeholder)] shadow-none focus-visible:border-[var(--app-border-focus)]',
  selectTrigger:
    'w-full rounded-md border-[var(--app-border-input)] bg-[var(--app-bg-input)] text-[var(--app-text-primary)] shadow-none focus-visible:border-[var(--app-border-focus)]',
  selectContent:
    'border-[var(--app-border-primary)] bg-[var(--app-bg-card)] text-[var(--app-text-primary)]',
  switch:
    'data-[state=checked]:bg-[var(--app-accent)] data-[state=unchecked]:bg-[var(--app-bg-secondary)]',
  primaryButton:
    'rounded-md border border-[var(--app-accent)] bg-[var(--app-accent)] text-[var(--app-text-on-accent)] hover:bg-[var(--app-accent-hover)]',
  outlineButton:
    'rounded-md border-[var(--app-border-primary)] bg-transparent text-[var(--app-text-secondary)] hover:bg-[var(--app-bg-hover)] hover:text-[var(--app-text-primary)]',
  dangerButton:
    'rounded-md border-[#E05252]/35 bg-transparent text-[#E05252] hover:bg-[#E05252]/10 hover:text-[#E05252]',
  modalSurface:
    'w-full rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-6 shadow-2xl',
  modalOverlay:
    'fixed inset-0 z-[70] flex items-center justify-center bg-[var(--app-bg-overlay)] backdrop-blur-sm',
  cardButton:
    'rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] text-[var(--app-text-primary)] hover:border-[var(--app-border-primary)] hover:bg-[var(--app-bg-secondary)]',
} as const;

/** Settings card. */
export function SettingsCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.card, className)} {...props}>
      {children}
    </div>
  );
}

/** Settings header. */
export function SettingsHeader({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start gap-3', className)}>
      {icon ? <div className="mt-0.5 text-[var(--app-text-secondary)]">{icon}</div> : null}
      <div>
        <h4 className={kloelSettingsClass.cardTitle}>{title}</h4>
        {description ? (
          <p className="mt-1 text-sm text-[var(--app-text-secondary)]">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Settings metric tile. */
export function SettingsMetricTile({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.metricTile, className)} {...props}>
      {children}
    </div>
  );
}

/** Settings inset. */
export function SettingsInset({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(kloelSettingsClass.inset, className)} {...props}>
      {children}
    </div>
  );
}

/** Settings switch row. */
export function SettingsSwitchRow({
  title,
  description,
  control,
  className,
}: {
  title: string;
  description?: string;
  control: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-md border border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] px-4 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--app-text-primary)]">{title}</p>
        {description ? (
          <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{description}</p>
        ) : null}
      </div>
      {control}
    </div>
  );
}

/** Settings notice. */
export function SettingsNotice({
  tone = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'info'
      ? 'border-[#3B82F6]/25 bg-[#3B82F6]/10 text-[#93C5FD]'
      : tone === 'success'
        ? 'border-[#10B981]/25 bg-[#10B981]/10 text-[#7FE2BC]'
        : tone === 'warning'
          ? 'border-[#E85D30]/25 bg-[#E85D30]/10 text-[#F2B29D]'
          : tone === 'danger'
            ? 'border-[#E05252]/25 bg-[#E05252]/10 text-[#F7A8A8]'
            : 'border-[var(--app-border-subtle)] bg-[var(--app-bg-primary)] text-[var(--app-text-secondary)]';

  return (
    <div className={cn('rounded-md border px-4 py-3', toneClass, className)} {...props}>
      {children}
    </div>
  );
}

/** Settings status pill. */
export function SettingsStatusPill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
  className?: string;
}) {
  const toneClass =
    tone === 'info'
      ? 'bg-[#3B82F6]/12 text-[#93C5FD]'
      : tone === 'success'
        ? 'bg-[#10B981]/12 text-[#7FE2BC]'
        : tone === 'warning'
          ? 'bg-[#E85D30]/12 text-[#F2B29D]'
          : tone === 'danger'
            ? 'bg-[#E05252]/12 text-[#F7A8A8]'
            : 'bg-[var(--app-bg-secondary)] text-[var(--app-text-secondary)]';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', toneClass, className)}>
      {children}
    </span>
  );
}

/** Settings modal. */
export function SettingsModal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={kloelSettingsClass.modalOverlay}>
      <div className={cn(kloelSettingsClass.modalSurface, className)}>{children}</div>
    </div>
  );
}
